const Anthropic = require("@anthropic-ai/sdk");
const { validateGeneratedCode } = require("./validateCode");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Generates the full course structure (lesson metadata + quiz) as JSON.
async function generateCoursePlan(topic, pdfText) {
  const context = pdfText
    ? `The student uploaded course material:\n\n${pdfText.slice(0, 12000)}`
    : `The student wants to learn about: ${topic}`;

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 6000,
    messages: [
      {
        role: "user",
        content: `
You are an expert educational content designer.

${context}

Generate a 6-lesson course plan and a 20-question assessment.

Return ONLY valid JSON, no markdown, exactly this structure:
{
  "lessons": [
    {
      "lessonNumber": 1,
      "title": "string (specific to the topic)",
      "description": "string (2-3 sentences)",
      "keyPoints": ["string", "string", "string", "string"]
    }
  ],
  "questions": [
    {
      "id": 1,
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correct": 0,
      "topic": "string"
    }
  ]
}

Rules:
- All content specific to the topic, never generic
- Exactly 4 keyPoints per lesson
- 20 questions distributed across the 6 lessons
- "correct" is the 0-based index
- Pure JSON only, no backticks
        `,
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function buildCodePrompt(lesson, componentName, scenes, totalFrames) {
  const sceneTable = scenes
    .map(
      (s, i) =>
        `Scene ${i + 1}: durationInFrames=${s.durationInFrames}, audioUrl="${s.audioUrl}"
   visualType: ${s.visualType}
   onScreenText: ${s.onScreenText}
   visualDescription: ${s.visualDescription}`
    )
    .join("\n\n");

  return `
You are an expert Remotion motion-graphics developer.

Generate a complete, self-contained Remotion composition for this lesson. The video is divided into scenes. Each scene has an EXACT frame duration (measured from its voiceover audio) and you MUST build each scene to that exact duration so the visuals stay in sync with the narration.

LESSON: ${lesson.title}

SCENES (in order) — build one <Series.Sequence> per scene, in this exact order, with these EXACT durations:

${sceneTable}

STRICT REQUIREMENTS — follow exactly or the render will fail:
1. The component MUST be named exactly "${componentName}" and exported as a named export: export const ${componentName} = () => { ... }
2. Import ONLY from "remotion" and "react".
   Allowed remotion imports: AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, staticFile.
3. The component takes NO props — all scene data is hardcoded from the SCENES list above.
4. Structure: a single <Series> containing one <Series.Sequence> per scene, IN ORDER.
5. Each <Series.Sequence> MUST use durationInFrames set to EXACTLY the number given for that scene above. Never change, compute, or round these numbers — copy them exactly.
6. Inside each <Series.Sequence>, include <Audio src={staticFile("<that scene's audioUrl>")} /> so the correct narration plays. The audioUrl values are paths relative to the Remotion public folder — always wrap them in staticFile().
7. Inside each scene, build animations that visually match that scene's visualDescription and display its onScreenText. Use spring entrances, interpolated fades, moving shapes, staggered reveals, SVG graphics — make it dynamic and educational.
8. The sum of all durationInFrames MUST equal exactly ${totalFrames}.
9. Use only inline styles. No external CSS, no Tailwind.
10. Do NOT include registerRoot or Composition — only the component itself plus any helper components.
11. Keep total code under 800 lines. Use reusable helper components and loops to stay concise.
12. Every <Series.Sequence> MUST have a positive integer durationInFrames (at least 1). Never produce a zero or negative duration.
13. PERFORMANCE: Keep each frame cheap to render. Do NOT put more than ~50 elements on screen at once. Avoid heavy per-frame computation, deeply nested loops, or generating large arrays inside the render function. Precompute static values outside the component. Every frame must render in well under one second.
14. Return ONLY the raw .tsx code. No markdown fences, no explanation.

Begin with imports, then any helper components, then the main "${componentName}" component. Make sure the final line closes the component cleanly.
  `;
}

// Generates the synced Remotion TSX code for ONE lesson using measured scenes.
async function generateLessonCode(
  lesson,
  componentName,
  scenes,
  totalFrames,
  maxAttempts = 3
) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `  [code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`
      );

      const stream = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 25000,
        stream: true,
        messages: [
          {
            role: "user",
            content: buildCodePrompt(lesson, componentName, scenes, totalFrames),
          },
        ],
      });

      let text = "";
      let stopReason = null;

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          text += event.delta.text;
        }
        if (event.type === "message_delta" && event.delta.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
      }

      if (stopReason === "max_tokens") {
        throw new Error("Hit max_tokens — code was truncated");
      }

      const code = text
        .replace(/```tsx|```typescript|```ts|```jsx|```/g, "")
        .trim();

      validateGeneratedCode(code, componentName);

      console.log(`  [code] Valid code generated (${code.length} chars)`);
      return code;
    } catch (err) {
      lastError = err;
      console.warn(
        `  [code] Attempt ${attempt} failed: ${err.message}. Retrying...`
      );
    }
  }

  throw new Error(
    `Failed to generate valid lesson code after ${maxAttempts} attempts: ${lastError?.message}`
  );
}

module.exports = { generateCoursePlan, generateLessonCode };