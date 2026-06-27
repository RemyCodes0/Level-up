const Anthropic = require("@anthropic-ai/sdk");
const { validateGeneratedCode } = require("./validateCode");
const { reviewGeneratedCode } = require("./codeCriticService");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// Maps the level (from the pre-course chat) into a concrete instruction the
// course planner can act on. Returns "" when no level was provided (user
// skipped the chat), so behaviour is unchanged in that case.
function buildLevelGuidance(level) {
  switch (level) {
    case "beginner":
      return `\nLEARNER LEVEL: BEGINNER. Assume no prior knowledge. Start from first principles, define every term plainly, use simple everyday analogies, and keep math/jargon to a minimum. Build confidence gradually.`;
    case "intermediate":
      return `\nLEARNER LEVEL: INTERMEDIATE. Assume the learner knows the basics. Briefly recap fundamentals, then focus on deeper mechanisms, connections between ideas, and worked examples with moderate technical depth.`;
    case "advanced":
      return `\nLEARNER LEVEL: ADVANCED. Assume strong existing knowledge. Skip the basics, move quickly, and focus on nuance, edge cases, rigorous detail, and higher-level synthesis. Use precise technical language freely.`;
    default:
      return "";
  }
}

async function generateCoursePlan(topic, pdfText, pdfBuffer, level = null, maxAttempts = 3) {
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

  const levelGuidance = buildLevelGuidance(level);

  const rules = `
Rules:
- All content specific to the topic, never generic
- Exactly 4 keyPoints per lesson
- 20 questions distributed across the 6 lessons
- "correct" is the 0-based index
- Pure JSON only, no backticks${levelGuidance}
- CRITICAL: Respond with ONLY the JSON object. No commentary, no acknowledgment, no clarifying questions — even if the input is unusually long, looks like a document rather than a short topic, or seems ambiguous. If the input is long or document-like, identify its single most central subject and build the course plan around that. Never refuse and never ask a follow-up question — always produce the JSON.`;

  let messages;

  if (pdfBuffer) {
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
   - CLAMP TO STOP RUNAWAY MOTION — this is critical for visual quality:
     By default interpolate KEEPS EXTRAPOLATING past the input range, so a value meant to stop at frame 30 keeps growing/moving forever and elements fly OFF-SCREEN. ALWAYS add { extrapolateLeft: "clamp", extrapolateRight: "clamp" } to any interpolate whose output should settle and stay put (scale, position, size, translateX/Y, width, height, radius).
     - BAD: interpolate(frame, [0, 30], [0, 1.5]) — keeps scaling past 1.5, element grows until it leaves the screen.
     - GOOD: interpolate(frame, [0, 30], [0, 1.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) — grows to 1.5 then HOLDS.
     - GOOD for slide-in that stays put: interpolate(frame, [0, 20], [-200, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
   - KEEP THINGS ON SCREEN: any element's final scale must stay roughly ≤ 1.5, and final x/y positions must keep it fully within a 1920x1080 frame. Never animate position or size toward a value that would push the element past the screen edges.
   - For INTENTIONAL continuous motion (rotation, orbiting, pulsing), do NOT use interpolate — use bounded periodic math instead: Math.sin(frame / k) and Math.cos(frame / k) oscillate forever between -1 and 1 so they never run away. transform: rotate uses (frame * speed) % 360 to loop cleanly. This is how you get endless motion that never leaves the screen.
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

WORKED EXAMPLE — this is exactly the pattern every scene must follow. Study the structure, the interpolate() calls, and the Audio tag closely before writing your own:

\`\`\`tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio } from "remotion";

function TitleCard({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  // Clamped so opacity settles at 1 and never overshoots.
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: "#1e293b" }}>
      <h1 style={{ color: "white", fontSize: 64, opacity, transform: \`scale(\${scale})\` }}>
        {text}
      </h1>
    </AbsoluteFill>
  );
}

export const LessonExample = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={150}>
        <Audio src={"https://example.com/audio/scene1.mp3"} />
        <TitleCard text="Introduction" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={210}>
        <Audio src={"https://example.com/audio/scene2.mp3"} />
        <AbsoluteFill style={{ backgroundColor: "#0f172a" }} />
      </Series.Sequence>
    </Series>
  );
};
\`\`\`

Notice in the example: every interpolate() call has 3 arguments (value, input range, output range) — and optionally a 4th options object for clamping — with the input/output as literal arrays of matching length; position/scale animations are CLAMPED so they settle instead of running off screen; the Audio tag's src is a plain string passed directly; durationInFrames values are plain integer literals; and helper components live above the main exported component. Follow this exact shape.

TIP — to avoid repeating the clamp object on every call, you MAY define it once and reuse it:
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
// then: interpolate(frame, [0, 30], [0, 1.5], CLAMP)
Passing CLAMP (a variable) as the 4th argument is fully allowed and encouraged.

Begin with imports, then any helper components, then the main component. Make sure the final line closes the component cleanly.
`;

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
        temperature: 0.4,
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

      const validatedCode = validateGeneratedCode(code, componentName, totalFrames);

      const review = await reviewGeneratedCode(validatedCode, lesson);
      if (!review.skipped && review.ok === false) {
        console.warn(
          `  [critic] Flagged issues for ${componentName}: ${review.issues?.join("; ")}`
        );
      }

      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      console.log(
        `  [code] Valid code generated (${validatedCode.length} chars) — took ${elapsedSec}s for ${componentName}`
      );
      return validatedCode;
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