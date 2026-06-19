const Anthropic = require("@anthropic-ai/sdk");
const { validateGeneratedCode } = require("./validateCode");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Generates the full course structure (lesson metadata + quiz) as JSON.
// Accepts either a text topic, extracted pdfText, or a raw pdfBuffer.
// When pdfBuffer is provided, the PDF is sent directly to Claude so it can
// see images, equations, and diagrams — not just extracted text.
// Safely extracts and parses a JSON object from a model response that may
// contain stray text, markdown fences, or a conversational preamble
// (e.g. "I'd be happy to help, but..."). Mirrors the same defensive parsing
// already used in sceneService.js.
function safeParseJson(text) {
  let clean = text.replace(/```json|```/g, "").trim();

  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1) {
    clean = clean.slice(first, last + 1);
  }

  clean = clean.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(clean);
}

async function generateCoursePlan(topic, pdfText, pdfBuffer, maxAttempts = 3) {
  const jsonSchema = `
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
}`;

  const rules = `
Rules:
- All content specific to the topic, never generic
- Exactly 4 keyPoints per lesson
- 20 questions distributed across the 6 lessons
- "correct" is the 0-based index
- Pure JSON only, no backticks
- CRITICAL: Respond with ONLY the JSON object. No commentary, no acknowledgment, no clarifying questions — even if the input is unusually long, looks like a document rather than a short topic, or seems ambiguous. If the input is long or document-like, identify its single most central subject and build the course plan around that. Never refuse and never ask a follow-up question — always produce the JSON.`;

  let messages;

  if (pdfBuffer) {
    // Send the PDF directly to Claude — handles images, equations, and diagrams
    messages = [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: `You are an expert educational content designer.

The student uploaded the course material above. Generate a 6-lesson course plan and a 20-question assessment based on its content.

Return ONLY valid JSON, no markdown, exactly this structure:
${jsonSchema}
${rules}`,
          },
        ],
      },
    ];
  } else {
    // Text topic or pre-extracted PDF text
    const context = pdfText
      ? `The student uploaded course material:\n\n${pdfText.slice(0, 6000)}`
      : `The student wants to learn about: ${topic}`;

    messages = [
      {
        role: "user",
        content: `
You are an expert educational content designer.

${context}

Generate a 6-lesson course plan and a 20-question assessment.

Return ONLY valid JSON, no markdown, exactly this structure:
${jsonSchema}
${rules}
        `,
      },
    ];
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 6000,
        messages,
      });

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      return safeParseJson(text);
    } catch (err) {
      lastError = err;
      console.warn(
        `  [plan] Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying...`
      );
    }
  }

  throw new Error(
    `Failed to generate a valid course plan after ${maxAttempts} attempts: ${lastError?.message}`
  );
}


// ── Static rules block, cached across all 6 lesson-code calls per course ───
// This text is IDENTICAL on every call to generateLessonCode — only the
// scene data (below, in the per-call user message) changes. Marking it
// cacheable means Anthropic charges ~10% of normal input price for this
// block on every call after the first within the cache window, instead of
// full price every single time. Same model, same output, same quality —
// purely a billing optimization on the part of the prompt that never changes.
const CODE_GEN_STATIC_RULES = `
You are an expert Remotion motion-graphics developer.

Generate a complete, self-contained Remotion composition for a lesson. The video is divided into scenes. Each scene has an EXACT frame duration (measured from its voiceover audio) and you MUST build each scene to that exact duration so the visuals stay in sync with the narration.

STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
1. The component MUST be named exactly as given below and exported as a named export: export const ComponentName = () => { ... }
2. Import ONLY from "remotion" and "react".
   Allowed remotion imports: AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio.
   Do NOT import staticFile — it is not available in this environment.
3. The component takes NO props — all scene data is hardcoded from the SCENES list given below.
4. Structure: a single <Series> containing one <Series.Sequence> per scene, IN ORDER.
5. Each <Series.Sequence> MUST use durationInFrames set to EXACTLY the number given for that scene. Never change, compute, or round these numbers — copy them exactly.
6. Inside each <Series.Sequence>, include <Audio src={"<that scene's audioUrl>"} /> using the exact URL string directly. The audioUrl values are full HTTP URLs — use them directly as the src, with NO staticFile() wrapper.
7. Inside each scene, build animations that visually match that scene's visualDescription and display its onScreenText. Use spring entrances, interpolated fades, moving shapes, staggered reveals, SVG graphics — make it dynamic and educational.
8. INTERPOLATE SAFETY — violations CRASH the video at runtime:
   - ALWAYS 3 arguments: interpolate(value, inputRange, outputRange). NEVER 2.
   - inputRange and outputRange MUST be inline literal arrays of the SAME length.
   - BAD: interpolate(frame, [0, 30]) — missing outputRange, CRASHES.
   - BAD: interpolate(frame, someVar, anotherVar) — could be undefined, CRASHES.
   - BAD: Array.from({length: n}, (_, i) => interpolate(frame, [0, d], arr[i])) — arr[i] might be undefined.
   - GOOD: interpolate(frame, [0, 30], [0, 1])
   - GOOD: interpolate(frame, [0, 15, 30], [0, 1, 0])
   - NEVER use Easing — it is not available in this environment.
   - When computing ranges with Array.from or .map, ALWAYS hardcode both arrays or verify lengths match BEFORE calling interpolate.
9. The sum of all durationInFrames MUST equal exactly the total given below.
10. Use only inline styles. No external CSS, no Tailwind.
11. Do NOT include registerRoot or Composition — only the component itself plus any helper components.
12. Keep total code under 800 lines. Use reusable helper components and loops to stay concise.
13. Every <Series.Sequence> MUST have a positive integer durationInFrames (at least 1). Never produce a zero or negative duration.
14. PERFORMANCE: Keep each frame cheap to render. Do NOT put more than ~50 elements on screen at once. Avoid heavy per-frame computation, deeply nested loops, or generating large arrays inside the render function. Precompute static values outside the component. Every frame must render in well under one second.
15. Return ONLY the raw .tsx code. No markdown fences, no explanation.
16. Put heavy emphasis on animations which is the key role of this app, producing astonishing animations, with only continuously moving animation scenes (most of the time).

Begin with imports, then any helper components, then the main component. Make sure the final line closes the component cleanly.
`;

// The per-call portion — lesson title + the exact scene table + total frames.
// This part DOES change every call, so it stays as a normal (uncached) block.
function buildPerLessonContent(lesson, componentName, scenes, totalFrames) {
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
LESSON: ${lesson.title}
COMPONENT NAME: ${componentName}
TOTAL FRAMES: ${totalFrames}

SCENES (in order) — build one <Series.Sequence> per scene, in this exact order, with these EXACT durations:

${sceneTable}
`;
}

// Generates the synced Remotion TSX code for ONE lesson using measured scenes.
// Runs on Claude Sonnet — the model that actually produced reliable,
// high-quality animation code in this pipeline. The static rules block is
// marked cacheable so repeated calls (one per lesson, 6 per course) are
// billed at a fraction of normal input price for that unchanging portion.
async function generateLessonCode(
  lesson,
  componentName,
  scenes,
  totalFrames,
  maxAttempts = 3
) {
  let lastError = null;
  const lessonStart = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `  [code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`
      );

      const stream = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 25000,
        stream: true,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: CODE_GEN_STATIC_RULES,
                cache_control: { type: "ephemeral" },
              },
              {
                type: "text",
                text: buildPerLessonContent(lesson, componentName, scenes, totalFrames),
              },
            ],
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

      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      console.log(
        `  [code] Valid code generated (${code.length} chars) — took ${elapsedSec}s for ${componentName}`
      );
      return code;
    } catch (err) {
      lastError = err;
      console.warn(
        `  [code] Attempt ${attempt} failed: ${err.message}. Retrying...`
      );
    }
  }

  const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
  throw new Error(
    `Failed to generate valid lesson code after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${lastError?.message}`
  );
}

module.exports = { generateCoursePlan, generateLessonCode };