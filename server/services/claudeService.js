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

// Prompt rewritten for Sonnet 5. Key differences from the 4.6 version:
//
// 1. WORKED EXAMPLE is now richly animated — two scenes showing real
//    continuous motion (orbiting particle, pulsing core, sine-wave drift),
//    not a static black rectangle. The model imitates the example more than
//    any written rule, so the example must demonstrate ambition, not caution.
//
// 2. EASING is now available — Sonnet 5 handles it correctly and shouldn't
//    be told to avoid it. Removed the "NEVER use Easing" prohibition.
//
// 3. PERFORMANCE limits relaxed — the 50-element cap and "keep frame cheap"
//    warnings were calibrated for 4.6's tendency to over-engineer loops.
//    Sonnet 5 is more disciplined; these limits were cutting off legitimate
//    visual richness.
//
// 4. LINE LIMIT raised from 800 to 1200 — Sonnet 5 writes more structured,
//    readable code with proper helper components. The old limit was forcing
//    it to compress scenes in ways that reduced animation quality.
//
// Crash-safety rules (interpolate shape, clamping, forbidden imports,
// duration sum) are kept — those reflect real runtime constraints of this
// environment, not compensations for model weakness.
const CODE_GEN_STATIC_RULES = `
You are a world-class Remotion motion-graphics developer creating visually astonishing educational animations. This is a premium learning product — every scene must feel alive, dynamic, and visually connected to the concept being taught.

Generate a complete, self-contained Remotion composition for a lesson. Each scene has an EXACT frame duration (measured from its voiceover audio) and you MUST build each scene to that exact duration.

STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
1. The component MUST be named exactly as given below and exported as a named export: export const ComponentName = () => { ... }
2. Import ONLY from "remotion" and "react".
   From "remotion": ANY named export works (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, Img, Video, random, interpolateColors, Loop, and any other real Remotion export) — EXCEPT staticFile, which is not available in this environment.
   From "react": only useMemo, useCallback, useRef are available. Do NOT use useState (Remotion components must be pure functions of the current frame — no local state that changes over time) or any other React hook.
   Do NOT import from any other library — only "remotion" and "react".
3. The component takes NO props — all scene data is hardcoded from the SCENES list given below.
4. Structure: a single <Series> containing one <Series.Sequence> per scene, IN ORDER.
5. Each <Series.Sequence> MUST use durationInFrames set to EXACTLY the number given for that scene. Never change, compute, or round these numbers — copy them exactly.
6. Inside each <Series.Sequence>, include <Audio src={"<that scene's audioUrl>"} /> using the exact URL string directly. The audioUrl values are full HTTP URLs — use them directly as the src, with NO staticFile() wrapper.

ANIMATION PHILOSOPHY — this is the most important section:
7. Every scene must have CONTINUOUS MOTION throughout its entire duration. A scene where elements just sit there after their entrance animation is a failure. Ask yourself: "what is moving right now at frame 100? at frame 200?" — something must always be moving.
8. ILLUSTRATE THE CONCEPT VISUALLY. Don't just display text. If the scene is about electrical current, animate electrons flowing. If it's about sorting algorithms, show elements moving into order. If it's about gravity, show orbiting. The animation IS the lesson.
9. Build rich multi-layered scenes: a moving background gradient or particle field, animated diagram elements in the middle layer, and text that reveals with spring or stagger on top. Three layers of motion make a scene feel alive.
10. Use the full creative toolkit:
    - spring() for bouncy, natural entrances
    - Easing.bezier() for custom easing curves (e.g. Easing.bezier(0.25, 0.46, 0.45, 0.94))
    - Math.sin(frame / k) and Math.cos(frame / k) for continuous periodic motion
    - (frame * speed) % 360 for looping rotation
    - Staggered reveals: interpolate(frame, [i * 5, i * 5 + 20], [0, 1]) for each element i
    - SVG paths and shapes for diagrams
    - Layered colors and gradients via inline styles

INTERPOLATE SAFETY — violations CRASH the video at runtime:
11. ALWAYS 3 arguments: interpolate(value, inputRange, outputRange). NEVER 2.
    - inputRange and outputRange MUST be inline literal arrays of the SAME length.
    - BAD: interpolate(frame, [0, 30]) — CRASHES.
    - GOOD: interpolate(frame, [0, 30], [0, 1])
12. CLAMP position/scale animations so elements don't fly off-screen:
    const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
    interpolate(frame, [0, 30], [0, 1], CLAMP) — settles at 1 and holds.
    For continuous motion (Math.sin, rotation), clamping is NOT needed — those are already bounded.
13. THE 1920x1080 FRAME IS A HARD BOUNDARY. This applies to EVERY element individually, not just "the scene" as a whole:
    - Single element: final scale ≤ 1.5, final position must stay within 1920x1080.
    - PARTICLE FIELDS / ARRAYS of elements (e.g. a ParticleField with many particles): EVERY individual particle's x and y must be generated within safe bounds, not just the field's general area. When randomly or programmatically generating positions for N elements, constrain each one explicitly, e.g.:
      const x = 100 + Math.random() * 1720;  // stays within [100, 1820], safely inside 1920
      const y = 100 + Math.random() * 880;   // stays within [100, 980], safely inside 1080
      Never generate a raw position across the full 0-1920/0-1080 range with no margin — anything near the exact edge risks clipping.
    - ORBITING elements: the orbit's radius PLUS the orbiting element's own size must not push it past the frame edge. If content is centered at 960,540, max radius should be roughly ≤ 450 (leaves margin on a 1080-tall frame). Check this explicitly: radius + size/2 must stay well inside the smaller frame dimension's half.
    - DRIFTING/OSCILLATING elements (Math.sin offsets added to a base position): the base position must already account for the maximum possible offset, so base ± amplitude never approaches an edge. E.g. if amplitude is 30px, keep base positions at least 60-80px from any edge.

CODE QUALITY:
14. The sum of all durationInFrames MUST equal exactly the total given below.
15. Use only inline styles. No external CSS, no Tailwind.
16. Do NOT include registerRoot or Composition.
17. Keep total code under 1200 lines. Use reusable helper components.
18. Every <Series.Sequence> MUST have a positive integer durationInFrames (at least 1).
19. Return ONLY the raw .tsx code. No markdown fences, no explanation.

WORKED EXAMPLE — two richly animated scenes. Study how EVERY frame has motion, how the concept is illustrated, how layers work together:

\`\`\`tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, Easing } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// A particle that orbits a central nucleus — illustrates atomic structure.
// Motion is CONTINUOUS: orbit never stops, pulse never stops.
function OrbitingParticle({ radius, speed, size, color, orbitColor }: {
  radius: number; speed: number; size: number; color: string; orbitColor: string;
}) {
  const frame = useCurrentFrame();
  const angle = (frame * speed * Math.PI) / 180;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return (
    <div style={{ position: "absolute", top: "50%", left: "50%", width: 0, height: 0 }}>
      <div style={{
        position: "absolute",
        width: size, height: size,
        borderRadius: "50%",
        backgroundColor: color,
        transform: \`translate(\${x - size / 2}px, \${y - size / 2}px)\`,
        boxShadow: \`0 0 \${size * 1.5}px \${orbitColor}\`,
      }} />
    </div>
  );
}

function AtomScene({ label }: { label: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Entrance: nucleus springs in
  const nucleusScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  // Continuous: nucleus pulses with sine wave
  const pulse = 1 + Math.sin(frame / 12) * 0.08;
  // Label fades in with custom easing
  const labelOpacity = interpolate(frame, [20, 50], [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
  });
  // Background hue slowly rotates
  const hue = (frame * 0.3) % 360;

  return (
    <AbsoluteFill style={{
      background: \`radial-gradient(circle at 50% 50%, hsl(\${hue}, 30%, 15%), #0a0a1a)\`,
      justifyContent: "center", alignItems: "center",
    }}>
      {/* Nucleus */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        backgroundColor: "#f59e0b",
        transform: \`scale(\${nucleusScale * pulse})\`,
        boxShadow: "0 0 40px #f59e0b, 0 0 80px #f59e0b55",
        position: "relative", zIndex: 2,
      }} />
      {/* Orbiting electrons at different radii and speeds */}
      <OrbitingParticle radius={120} speed={2.4} size={20} color="#60a5fa" orbitColor="#3b82f6" />
      <OrbitingParticle radius={180} speed={1.6} size={16} color="#a78bfa" orbitColor="#7c3aed" />
      <OrbitingParticle radius={240} speed={1.0} size={14} color="#34d399" orbitColor="#059669" />
      {/* Label */}
      <div style={{
        position: "absolute", bottom: 180,
        color: "white", fontSize: 36, fontWeight: 700,
        opacity: labelOpacity, letterSpacing: 2,
        textShadow: "0 2px 20px rgba(0,0,0,0.8)",
      }}>{label}</div>
    </AbsoluteFill>
  );
}

// A wave propagation scene — illustrates how waves travel through a medium.
// Every point on the wave oscillates continuously with a phase offset.
function WaveScene({ label }: { label: string }) {
  const frame = useCurrentFrame();
  const points = 32;
  const labelOpacity = interpolate(frame, [10, 40], [0, 1], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
      <svg width={1920} height={400} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)" }}>
        {/* Wave made of individually oscillating circles for a particle-wave look */}
        {Array.from({ length: points }, (_, i) => {
          const x = (i / (points - 1)) * 1920;
          const phase = (i / points) * Math.PI * 4;
          const y = 200 + Math.sin(frame / 10 + phase) * 80;
          const brightness = (Math.sin(frame / 10 + phase) + 1) / 2;
          return (
            <circle
              key={i}
              cx={x} cy={y} r={8}
              fill={"hsl(" + (200 + brightness * 60) + ", 80%, " + (40 + brightness * 40) + "%)"}
              opacity={0.6 + brightness * 0.4}
            />
          );
        })}
        {/* Connecting line */}
        <polyline
          points={Array.from({ length: points }, (_, i) => {
            const x = (i / (points - 1)) * 1920;
            const phase = (i / points) * Math.PI * 4;
            const y = 200 + Math.sin(frame / 10 + phase) * 80;
            return \`\${x},\${y}\`;
          }).join(" ")}
          fill="none"
          stroke="rgba(96,165,250,0.4)"
          strokeWidth={2}
        />
      </svg>
      <div style={{
        position: "absolute", bottom: 160,
        color: "white", fontSize: 36, fontWeight: 700,
        opacity: labelOpacity, textShadow: "0 2px 20px rgba(0,0,0,0.9)",
      }}>{label}</div>
    </AbsoluteFill>
  );
}

export const LessonExample = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={210}>
        <Audio src={"https://example.com/audio/scene1.mp3"} />
        <AtomScene label="Electrons orbit the nucleus" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={240}>
        <Audio src={"https://example.com/audio/scene2.mp3"} />
        <WaveScene label="Waves propagate through a medium" />
      </Series.Sequence>
    </Series>
  );
};
\`\`\`

Every scene above has motion on EVERY frame. The atom's nucleus pulses, electrons orbit, background hue shifts. The wave's particles oscillate continuously. There is no static frame. Build every scene in your lesson to this standard.

Begin with imports, then the CLAMP constant, then helper components, then the main component.
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
        model: "claude-sonnet-5",
        // Sonnet 5 enables adaptive thinking by default, which consumes tokens
        // from the same max_tokens budget as the code output — silently
        // truncating the generated code before it finishes. Thinking is not
        // useful for deterministic code generation, so we disable it
        // explicitly. Without thinking tokens competing for budget, the full
        // allocation goes to actual code output.
        thinking: { type: "disabled" },
        // Raised from 32000: Sonnet 5's new tokenizer produces ~30% more
        // tokens for the same text, so equivalent code needs more headroom.
        max_tokens: 48000,
        // temperature is deprecated on claude-sonnet-4-5 and newer models — removed.
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