const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const { validateGeneratedCode } = require("./validateCode");
const { reviewGeneratedCode } = require("./codeCriticService");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GLM-5.2 client for lesson code generation — OpenAI-compatible
const glmClient = new OpenAI({
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.z.ai/api/paas/v4/",
  timeout: 300 * 1000, // 5 minute timeout — if GLM takes longer, fail fast and retry
  maxRetries: 0,       // handle retries manually
});

// ── Retry helper with exponential backoff + jitter ──────────────────────────
// Hammering a rate-limited or momentarily-overloaded API with zero delay
// makes correlated failures across all attempts more likely, not less.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backoffDelay(attempt, baseMs = 500, capMs = 8000) {
  const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  const jitter = Math.random() * exp * 0.3;
  await sleep(exp + jitter);
}

// ── Tiny concurrency limiter (no new dependency) ────────────────────────────
// If multiple lessons generate code in parallel, each one calls
// generateLessonCode independently with no awareness of the others. If the
// GLM endpoint enforces a max-simultaneous-connections limit, firing 5-6
// requests at once can produce instant "Connection error." failures that
// look like network flakiness but are actually a self-inflicted concurrency
// spike. This wraps the actual API call so no matter how many lessons are
// kicked off concurrently by the caller, only N requests to GLM are ever
// in flight at once — everything else queues.
function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

// Cap simultaneous in-flight requests to GLM. Adjust via env var if the
// provider's actual limit turns out to be higher or lower than this default.
// Raised default from 3 to 6 — GLM-5.2 is a sparse MoE model (~40B active of
// 743B total params per token), which is specifically designed to handle
// concurrent requests efficiently since serving infra (vLLM/SGLang) routes
// experts per-request rather than one request blocking the whole model.
// A 6-lesson course was being artificially serialized into two waves of 3;
// this lets all 6 lessons reason + generate in parallel. If this trips rate
// limits on Z.AI's shared endpoint, lower via the GLM_MAX_CONCURRENT env var.
const GLM_MAX_CONCURRENT = Number(process.env.GLM_MAX_CONCURRENT) || 6;
const limitGlmCall = createLimiter(GLM_MAX_CONCURRENT);

// Pull the useful bits out of a connection-level failure. The OpenAI SDK
// collapses network errors (DNS, TLS, ECONNRESET, connection refused, etc.)
// into a generic "Connection error." message and stashes the actual cause
// on err.cause — which the old code never logged, making these failures
// indistinguishable from each other.
function describeError(err) {
  const cause = err?.cause;
  if (!cause) return err.message;
  const causeCode = cause.code || cause.errno || cause.name;
  const causeMsg = cause.message || String(cause);
  return `${err.message} [cause: ${causeCode ? `${causeCode} — ` : ""}${causeMsg}]`;
}

// ── Safer JSON extraction ────────────────────────────────────────────────────
// The old version used indexOf("{") / lastIndexOf("}"), which grabs from the
// FIRST brace to the LAST brace anywhere in the text. Any stray brace in
// trailing commentary, or inside a string value, silently produces the wrong
// slice. This version walks the text tracking bracket depth and string state,
// so it finds the actual matching close brace for the first top-level object.
function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null; // Never closed — truncated response
}

function safeParseJson(text) {
  let clean = text.replace(/```json|```/g, "").trim();

  const extracted = extractFirstJsonObject(clean);
  if (!extracted) {
    throw new Error("Could not locate a complete JSON object in model output");
  }
  clean = extracted;

  // Trailing-comma cleanup is still text-level, but now scoped to a JSON
  // object we've already structurally validated the boundaries of, which
  // makes it much lower risk than applying it to the whole raw response.
  clean = clean.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(clean);
}

// ── Course plan shape validation ────────────────────────────────────────────
// Parsing succeeds != the plan is usable. The prompt promises 6 lessons with
// exactly 4 keyPoints each and 20 questions with valid option/answer shapes;
// nothing previously checked that promise was kept before handing the plan
// downstream to code generation, which assumes it.
function validateCoursePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== "object") {
    errors.push("Plan is not an object");
    return { ok: false, errors };
  }

  if (!Array.isArray(plan.lessons) || plan.lessons.length !== 6) {
    errors.push(`Expected 6 lessons, got ${plan.lessons?.length ?? "none"}`);
  } else {
    plan.lessons.forEach((lesson, i) => {
      if (!lesson.title || typeof lesson.title !== "string") {
        errors.push(`Lesson ${i + 1}: missing/invalid title`);
      }
      if (!lesson.description || typeof lesson.description !== "string") {
        errors.push(`Lesson ${i + 1}: missing/invalid description`);
      }
      if (!Array.isArray(lesson.keyPoints) || lesson.keyPoints.length !== 4) {
        errors.push(
          `Lesson ${i + 1}: expected 4 keyPoints, got ${lesson.keyPoints?.length ?? "none"}`
        );
      }
    });
  }

  if (!Array.isArray(plan.questions) || plan.questions.length !== 20) {
    errors.push(`Expected 20 questions, got ${plan.questions?.length ?? "none"}`);
  } else {
    plan.questions.forEach((q, i) => {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`Question ${i + 1}: expected 4 options`);
      }
      if (
        typeof q.correct !== "number" ||
        q.correct < 0 ||
        q.correct > 3 ||
        !Number.isInteger(q.correct)
      ) {
        errors.push(`Question ${i + 1}: "correct" must be an integer 0-3`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
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

const MAX_PDF_TEXT_CHARS = 6000;

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
  let truncated = false;

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
    truncated = Boolean(pdfText && pdfText.length > MAX_PDF_TEXT_CHARS);
    const context = pdfText
      ? `The student uploaded course material:\n\n${pdfText.slice(0, MAX_PDF_TEXT_CHARS)}`
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

  if (truncated) {
    console.warn(
      `  [plan] pdfText truncated from ${pdfText.length} to ${MAX_PDF_TEXT_CHARS} chars — course plan may miss later sections.`
    );
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

      const plan = safeParseJson(text);

      const { ok, errors } = validateCoursePlan(plan);
      if (!ok) {
        throw new Error(`Course plan failed shape validation: ${errors.join("; ")}`);
      }

      // Keep the return shape identical to the original function (the plan
      // object itself, with lessons/questions at the top level) so existing
      // callers like courseController.js don't break. The truncation flag
      // is attached directly to the plan instead of wrapping it, so
      // `plan.lessons` / `plan.questions` still work exactly as before.
      if (truncated) {
        plan.__truncatedInput = true;
      }
      return plan;
    } catch (err) {
      lastError = err;
      console.warn(
        `  [plan] Attempt ${attempt}/${maxAttempts} failed: ${describeError(err)}. Retrying...`
      );
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(
    `Failed to generate a valid course plan after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
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
⚠️ OUTPUT FORMAT: You MUST respond with ONLY raw TypeScript/TSX code. No explanations, no descriptions, no topic summaries, no markdown. The FIRST character of your response must be "i" (from "import"). If you output anything other than TSX code, the entire system fails and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer creating visually astonishing educational animations. This is a premium learning product — every scene must feel alive, dynamic, and visually connected to the concept being taught.

Generate a complete, self-contained Remotion composition for a lesson. Each scene has an EXACT frame duration (measured from its voiceover audio) and you MUST build each scene to that exact duration.

STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
1. The component MUST be named exactly as given below and exported as a named export: export const ComponentName = () => { ... }
2. Import ONLY from "remotion" and "react".
   From "remotion": ANY named export works (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop) — EXCEPT staticFile, which is not available.
   From "react": ONLY useMemo, useCallback, useRef. DO NOT use useState — it DOES NOT EXIST in this sandbox. Using useState will crash the video.
   Do NOT import from any other library.
3. The component takes NO props — all data is hardcoded. This means variables like user, currentUser, session, props, context, or anything implying external/dynamic data DO NOT EXIST and referencing them crashes with "X is not defined". Every variable you use must be either: (a) declared locally with const/let inside your own code, (b) a real Remotion or React export from the allowed list, or (c) a parameter of a function you wrote yourself. Nothing else is available — there is no login state, no user data, no external context of any kind.
   NEVER use a JavaScript built-in name (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set) as a variable, function parameter, or destructured prop name. Doing so shadows the real built-in inside that scope and crashes with "X.method is not a function" — for example, naming a helper component's parameter Math means Math.sin inside that component no longer refers to the real Math object at all, it refers to whatever value was actually passed in for that parameter.
4. Structure: a single <Series> with one <Series.Sequence> per scene, IN ORDER. Do NOT use a bare <Sequence> anywhere, including inside a scene component. A <Sequence from={...} durationInFrames={...}> nested inside a scene will UNMOUNT its children once its own duration elapses — even if that's shorter than the scene's real duration — which makes the visual disappear while the audio (in the parent Series.Sequence) keeps playing. If part of a scene should only show for a portion of the scene, control that with interpolate()-driven opacity/scale on an always-mounted element, never by wrapping it in a shorter-lived Sequence.
5. Each <Series.Sequence durationInFrames={EXACT_NUMBER}> — copy the number EXACTLY. Never compute or round it.
6. Inside each sequence: <Audio src={"EXACT_URL"} /> — copy URLs exactly, NO staticFile() wrapper.

ANIMATION QUALITY — THIS IS THE MOST CRITICAL REQUIREMENT. A boring animation is a failed animation.
The user is paying for animated video lessons. If the animations are generic, static, or visually uninteresting, the product fails entirely. Every scene must feel like a professional motion graphics studio made it.

7. CONTINUOUS MOTION IS NON-NEGOTIABLE. At frame 0, things move. At frame 100, things move. At frame 200, things move. If anything stops moving after its entrance animation, the scene is wrong. Use Math.sin(frame/k), Math.cos(frame/k), and (frame*speed)%360 to guarantee perpetual motion on every element.

8. ILLUSTRATE THE EXACT CONCEPT — not generic particles. If the topic is DNA replication, show the double helix unwinding with individual base pairs. If it's photosynthesis, show photons hitting chlorophyll and electrons jumping energy levels. If it's sorting algorithms, show actual elements moving into order. If it's electromagnetism, show field lines rotating. The animation must make the concept VISIBLE — a viewer with no prior knowledge should understand the concept from the visuals alone, without reading the text.

9. THREE MANDATORY LAYERS — all three must exist in every scene:
   - Layer 1 (background): Continuously moving gradient, rotating color field, or drifting particle system. Never static.
   - Layer 2 (concept): The main animated diagram — the thing that illustrates what the scene teaches. This is the star of the scene.
   - Layer 3 (text): Text that springs or fades in, positioned so it doesn't overlap layer 2.

10. RICHNESS REQUIREMENTS — every scene must have at least:
    - 5+ animated elements (not counting background particles) — richer than a minimal diagram, build a genuinely layered scene
    - At least 2 elements using spring() for staggered, natural entrances (not just one)
    - At least 2 elements using Math.sin/Math.cos with DIFFERENT periods/phases for continuous motion that doesn't look synchronized/robotic
    - A background particle field or ambient motion layer with 30-40 elements, each with independent timing (via index-based delay/phase offsets) — never all moving in lockstep
    - Colors chosen to match the concept (biology = greens, physics = blues/purples, chemistry = warm colors), with a gradient or multi-color palette per scene, not a single flat color
    - Glow effects (boxShadow with color) on EVERY primary element, not just one — layer glows of different intensities to create visual depth
    - At least one element with a secondary/orbiting motion (something moving around another moving thing, not just independent motions)
    - The concept name or key formula as text, appearing with a stagger after the visual is established, plus a secondary supporting text label revealing shortly after

    THIS IS ENFORCED, NOT A SUGGESTION: a scene consisting of only a title fading in over a plain background, with no shape/diagram illustrating the concept, WILL be rejected and regenerated. Every scene needs a real Layer 2 diagram — text alone is never sufficient, no matter how well-animated the text itself is. A scene with only 1-2 simple animated elements and no particle field is UNDER the bar — push for maximum visual density and motion complexity within the line budget.

INTERPOLATE SAFETY — these violations CRASH the video at runtime, no exceptions:
11. interpolate() ALWAYS needs exactly 3 arguments: interpolate(value, [in...], [out...]).
    - The 2nd and 3rd arguments (inputRange, outputRange) MUST be array literals written directly in the call — [0, 20] — containing ONLY plain number literals. NEVER a variable holding an array, and NEVER an expression inside the array (no "end - 30", no "i * 8", no "startFrame + 20"). If a value needs to vary, shift the FIRST argument instead — see the staggering technique below — never the array contents.
    - CRASH: interpolate(frame, [startFrame, startFrame + 20], [...]) — startFrame may be undefined = NaN, and this is a variable/expression inside the array either way.
    - CRASH: interpolate(frame, [durationInFrames - 30, durationInFrames], [...]) — durationInFrames is not in scope inside scene components, and it's an expression inside the array regardless.
    - CRASH: interpolate(frame, [end - 30, end], [...]) — even if "end" was itself declared as "const end = 210", referencing it inside the array is still banned. The array must contain the literal numbers themselves: [180, 210].
    - GOOD: interpolate(frame, [0, 20], [0, 1], CLAMP) — plain number literals only, nothing else.
    - If a boundary depends on scene duration, you already know that duration as a plain number (it's given to you per-scene) — write it directly as a literal: interpolate(frame, [180, 210], [1, 0], CLAMP), not a variable reference to it.
    - CRASH: interpolate(frame, [0, 30, 60, 60], [...]) — duplicate 60. Fix: [0, 30, 60, 91]
    - CRASH: interpolate(frame, [300, 320, 466, 466], [...]) — duplicate 466. Fix: [300, 320, 466, 467]
    - CRASH: interpolate(frame, [0, 30]) — missing outputRange. Fix: interpolate(frame, [0, 30], [0, 1])
    - For hold-at-final-value: use 2 values + CLAMP. interpolate(frame, [0, 30], [0, 1], CLAMP) — NOT [0, 30, 30].
    - For staggered elements (e.g. inside a .map over an index i): do NOT put i inside the array — that's banned. Instead shift the VALUE argument: interpolate(frame - i * 8, [0, 20], [0, 1], CLAMP). This gives each element its own staggered start time while keeping the inputRange a plain literal array, exactly as required.
12. NEVER produce NaN in any SVG attribute (cx, cy, r, x, y, width, height, points, d):
    - Guard ALL division: write (value / (denominator || 1)) — never divide without this guard.
    - Guard ALL array access: check i < arr.length before arr[i]. Out-of-bounds = NaN.
    - Math.sin/cos ALWAYS receive a plain number — never undefined, null, or a string.
    - Polygon/polyline points: filter out any NaN before joining: points.filter(p => !isNaN(p.x) && !isNaN(p.y))
    - When using random() or useMemo for positions, ALWAYS validate the result is finite before using it.
13. CLAMP entrance animations so elements don't fly off-screen after settling:
    const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
    Use CLAMP for interpolate() entrance animations. For Math.sin/cos continuous motion, CLAMP is NOT needed.
14. THE 1920x1080 FRAME IS A HARD BOUNDARY. Elements that drift to the edges or off-screen are a FAILED scene even if they don't crash — the user simply cannot see them, which is just as bad as a crash. Do NOT compute safe positions by hand for each element. Instead, define these constants ONCE at the top of the file and route every position through them:

    const FRAME = { w: 1920, h: 1080 };
    const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 }; // keep all element CENTERS inside this box
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    Apply this pattern to EVERY positioned element, with no exceptions:
    - Static/random position: const x = clamp(rawX, SAFE.xMin, SAFE.xMax); const y = clamp(rawY, SAFE.yMin, SAFE.yMax);
    - Oscillating (base ± amplitude*sin/cos): compute the raw value, THEN clamp it — never trust that base±amplitude "should" stay in range:
      const rawY = baseY + Math.sin(frame / 10) * amplitude;
      const y = clamp(rawY, SAFE.yMin, SAFE.yMax);
    - Orbiting: radius must satisfy centerX ± radius and centerY ± radius both land within SAFE — i.e. radius ≤ min(centerX - SAFE.xMin, SAFE.xMax - centerX, centerY - SAFE.yMin, SAFE.yMax - centerY). For a center at (960, 540), radius ≤ 420 is always safe.
    - Text: position from SAFE bounds too, and additionally leave ≥80px margin from SAFE's own edges since text has width/height beyond its anchor point.
    - Particles/background elements: also clamp, even though they're decorative — an off-screen particle wastes a draw call and a few stray ones drifting to the edge look like a bug to the viewer.

    This clamp MUST be the last operation applied to any x/y/cx/cy/top/left value before it's used in a style or SVG attribute — clamping the raw input to a formula and then adding more offsets afterward defeats the purpose.

CODE QUALITY:
15. Sum of all durationInFrames MUST equal the total given. Verify before finishing.
16. Inline styles ONLY. No Tailwind, no external CSS, no className for styling.
17. No registerRoot, no Composition.
18. Each scene component should be 200-300 lines — use the full budget to create rich, detailed animations. Extract shared helper components (ParticleBg, OrbitRing, Label) at the top to avoid repetition across scenes.
19. Every <Series.Sequence> must have a positive integer durationInFrames ≥ 1.
20. NEVER write comma-separated expressions directly inside JSX curly braces: {a, b} is invalid JSX. Use separate expressions, or wrap in parens: {(a, b)} — but better to split into separate JSX attributes or elements.
21. NEVER write a literal { or } character directly as JSX text content — JSX treats every { as opening a JS expression, so a bare } with no matching opener is a parse error.
    - CRASH: <div>f(x) = {x²}</div> — the { here isn't a JS expression, it's meant to be literal text, so JSX chokes on it.
    - CRASH: <div>Set notation: {1, 2, 3}</div> — same problem, bare braces in text.
    - CRASH: <div>Config: {{ key: value }}</div> as plain display text (not an actual style object) — same problem.
    - GOOD: if you need to DISPLAY a literal brace character, wrap it as a string expression: <div>f(x) = {"{"}x²{"}"}</div>
    - BETTER: avoid literal braces in on-screen text entirely. Rewrite math/set notation in words or with different symbols: "f of x equals x squared" or use parentheses/brackets instead of braces where the concept allows it.

WORKED EXAMPLE — two richly animated scenes. Study how EVERY frame has motion, how the concept is illustrated, how layers work together:

\`\`\`tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, Easing } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// Frame-boundary safety — defined ONCE, used by every positioned element.
// See rule 14: never hand-compute a "should stay in bounds" position —
// always clamp the final value instead.
const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A particle that orbits a central nucleus — illustrates atomic structure.
// Motion is CONTINUOUS: orbit never stops, pulse never stops. The orbit
// radius is chosen so centerX/centerY ± radius stays inside SAFE, and the
// final position is still clamped as a last line of defense.
function OrbitingParticle({ radius, speed, size, color, orbitColor, centerX = 960, centerY = 540 }: {
  radius: number; speed: number; size: number; color: string; orbitColor: string; centerX?: number; centerY?: number;
}) {
  const frame = useCurrentFrame();
  const angle = (frame * speed * Math.PI) / 180;
  const rawX = centerX + Math.cos(angle) * radius;
  const rawY = centerY + Math.sin(angle) * radius;
  const x = clampPos(rawX, SAFE.xMin, SAFE.xMax);
  const y = clampPos(rawY, SAFE.yMin, SAFE.yMax);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}>
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
        `Scene ${i + 1}: durationInFrames=${s.durationInFrames}, audioUrl="${s.audioUrl}", targetLines=200-300
   visualType: ${s.visualType}
   onScreenText: ${s.onScreenText}
   visualDescription: ${s.visualDescription}`
    )
    .join("\n\n");

  return `
LESSON: ${lesson.title}
COMPONENT NAME: ${componentName}
TOTAL FRAMES: ${totalFrames}
TOTAL SCENES: ${scenes.length}
LINE BUDGET: 200-300 lines per scene — use the full budget to create rich, detailed animations. Shared helper components don't count toward per-scene budget.

SCENES (in order) — build one <Series.Sequence> per scene, in this exact order, with these EXACT durations:

${sceneTable}
`;
}

// ── Auto-fix common GLM-5.2 code generation errors ───────────────────────────
// These are systematic mistakes GLM-5.2 makes even with strict prompt rules.
// IMPORTANT: every fix here is text-level, not AST-level, which means each
// one carries some risk of mutating already-correct code. To keep that risk
// low:
//   - Only fixes with a very low false-positive surface are kept.
//   - Anything ambiguous now THROWS instead of guessing, so it triggers a
//     regeneration attempt rather than silently shipping mangled code.
//   - Every fix that fires logs what it changed, so corruption introduced by
//     this function is visible in logs instead of indistinguishable from a
//     model mistake.
function autoFixCode(code, { totalFrames } = {}) {
  let fixed = code;
  const notes = [];

  // Fix 1: kebab-case CSS property names → camelCase JSX equivalents.
  // Low risk: these patterns only match inside object-literal-style
  // `property:` positions and camelCase is unambiguous.
  const cssPropertyMap = {
    "transform-origin": "transformOrigin",
    "background-color": "backgroundColor",
    "font-size": "fontSize",
    "font-weight": "fontWeight",
    "border-radius": "borderRadius",
    "box-shadow": "boxShadow",
    "letter-spacing": "letterSpacing",
    "text-align": "textAlign",
    "pointer-events": "pointerEvents",
  };
  for (const [kebab, camel] of Object.entries(cssPropertyMap)) {
    const pattern = new RegExp(`["']?${kebab}["']?\\s*:`, "g");
    if (pattern.test(fixed)) {
      fixed = fixed.replace(pattern, `${camel}:`);
      notes.push(`renamed CSS property ${kebab} -> ${camel}`);
    }
  }

  // Fix 2: Duplicate/non-increasing inputRange values in interpolate() calls.
  // Only touches interpolate() calls whose entire inputRange is plain
  // numeric literals — anything containing a variable/expression is left
  // untouched, since we can't safely reason about its runtime value.
  fixed = fixed.replace(
    /interpolate\s*\(\s*([^,]+),\s*\[([^\]]+)\]/g,
    (match, value, rangeStr) => {
      const parts = rangeStr.split(",").map((s) => s.trim());
      const nums = parts.map(Number);
      if (nums.some((n) => Number.isNaN(n))) return match; // has a variable — skip
      let changed = false;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] <= nums[i - 1]) {
          nums[i] = nums[i - 1] + 1;
          changed = true;
        }
      }
      if (changed) notes.push(`fixed non-increasing interpolate inputRange near "${value.trim()}"`);
      return `interpolate(${value}, [${nums.join(", ")}]`;
    }
  );

  // Fix 2b: unbounded Math.random() * 1920 / * 1080 used directly as a
  // position. This is the single most common cause of elements drifting
  // off-screen — the prompt rule asks for an inset SAFE range, but the
  // model sometimes reaches for the raw canvas dimensions anyway. Rewrite
  // to a safely-inset range (100px margin on each side) rather than relying
  // solely on the model following the SAFE-constant pattern correctly.
  const rawWidthPattern = /Math\.random\(\)\s*\*\s*1920(?!\d)/g;
  const rawHeightPattern = /Math\.random\(\)\s*\*\s*1080(?!\d)/g;
  if (rawWidthPattern.test(fixed)) {
    fixed = fixed.replace(rawWidthPattern, "(100 + Math.random() * 1720)");
    notes.push("clamped unbounded Math.random() * 1920 position to a safe inset range");
  }
  if (rawHeightPattern.test(fixed)) {
    fixed = fixed.replace(rawHeightPattern, "(100 + Math.random() * 880)");
    notes.push("clamped unbounded Math.random() * 1080 position to a safe inset range");
  }


  // Fix 3: bare `durationInFrames` used where it isn't in scope.
  // Rather than silently substituting a guessed fallback value (which can
  // quietly change animation timing with no visible signal), we now require
  // an explicit totalFrames to substitute, and we LOG every substitution so
  // it shows up in review rather than disappearing into the diff.
  if (/\bdurationInFrames\b(?!\s*[=:])/.test(fixed)) {
    const fallback = Number.isFinite(totalFrames) ? totalFrames : null;
    if (fallback === null) {
      throw new Error(
        "Code references out-of-scope `durationInFrames` and no totalFrames was provided to safely substitute — regenerating."
      );
    }
    notes.push(`substituted out-of-scope durationInFrames -> ${fallback}`);
    fixed = fixed.replace(/\bdurationInFrames\b(?!\s*[=:])/g, `${fallback}`);
  }

  // Fix 4: common HTML-attribute-in-JSX slips.
  fixed = fixed.replace(/\bclass=/g, "className=");
  fixed = fixed.replace(/\bfor=/g, "htmlFor=");

  // Fix 5: unterminated template literal — trailing corruption at end of file.
  // Previously this guessed a closing wrapper (`);\n}`) that may not match
  // the actual function shape, which can produce code that's still invalid
  // in a new way. That's a worse outcome than failing loudly, so this now
  // throws to force a regeneration attempt instead of guessing.
  const backtickCount = (fixed.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    throw new Error("Unterminated template literal detected — regenerating instead of guessing a fix.");
  }

  // Fix 6: harmless whitespace/punctuation noise, safe regardless of context.
  fixed = fixed.replace(/;;/g, ";");
  fixed = fixed.replace(/,(\s*[}\)])/g, "$1");

  if (notes.length) {
    console.log(`  [autofix] Applied: ${notes.join(" | ")}`);
  }

  return fixed;
}

// ── Enforce correct audio URLs — don't trust the model to copy them right ───
// GLM-5.2 (and any LLM) can occasionally mistype a single character when
// transcribing a long, random UUID into generated code — e.g. writing
// "...ba3e-..." as "...be3e-..." in an <Audio src="..."> tag. The rest of the
// URL matches perfectly, but that one scene's audio silently 404s forever,
// since the file that URL points to was never actually created.
//
// Rather than hoping the model copies a 36-character random string
// perfectly every time, we enforce it deterministically: scenes are always
// wired into <Series.Sequence> tags IN ORDER, so we can match each
// <Audio src="..."> occurrence (in the order it appears) to the
// corresponding scene in our own `scenes` array — which has the guaranteed-
// correct, actually-existing-on-disk URL — and force-replace it if it
// doesn't match exactly.
function enforceCorrectAudioUrls(code, scenes) {
  let sceneIndex = 0;
  let mismatchCount = 0;

  const fixed = code.replace(/<Audio\s+src=\{"([^"}]+)"\}/g, (match, foundUrl) => {
    if (sceneIndex >= scenes.length) return match; // more Audio tags than scenes — leave as-is, validateGeneratedCode will catch structural issues
    const correctUrl = scenes[sceneIndex].audioUrl;
    sceneIndex++;

    if (foundUrl !== correctUrl) {
      mismatchCount++;
      console.warn(
        `  [audio-url-fix] Scene ${sceneIndex}: model wrote a URL that doesn't match the real file — correcting it.\n` +
        `    Model wrote:  ${foundUrl}\n` +
        `    Correct URL:  ${correctUrl}`
      );
      return `<Audio src={"${correctUrl}"}`;
    }
    return match;
  });

  if (mismatchCount > 0) {
    console.warn(`  [audio-url-fix] Corrected ${mismatchCount} mismatched audio URL(s) out of ${scenes.length} scenes.`);
  }

  return fixed;
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

      const stream = await limitGlmCall(() =>
        glmClient.chat.completions.create({
          model: "glm-5.2",
          thinking: { type: "disabled" },
          max_tokens: 100000,
          stream: true,
          messages: [
            {
              role: "system",
              content: CODE_GEN_STATIC_RULES,
            },
            {
              role: "user",
              content: buildPerLessonContent(lesson, componentName, scenes, totalFrames),
            },
          ],
        })
      );

      let text = "";
      let stopReason = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        // Only collect actual content, not reasoning_content tokens
        if (delta?.content) text += delta.content;
        if (chunk.choices[0]?.finish_reason) stopReason = chunk.choices[0].finish_reason;
      }

      if (stopReason === "length") {
        throw new Error("Hit max_tokens — code was truncated");
      }

      const code = text
        .replace(/```tsx|```typescript|```ts|```jsx|```/g, "")
        .trim();

      // Detect plain text output — GLM-5.2 sometimes ignores the prompt and
      // outputs topic descriptions instead of TSX code. Catch this early.
      if (!code.startsWith("import") && !code.startsWith("const") && !code.startsWith("//") && !code.startsWith("export")) {
        throw new Error("Model output plain text instead of TSX code — ignoring system prompt");
      }

      // ── Auto-fix common GLM-5.2 output errors ─────────────────────────────
      const fixedCode = autoFixCode(code, { totalFrames });

      // ── Force-correct any mistyped audio URLs — don't trust the model's
      // ability to transcribe long UUID strings perfectly. This is what
      // actually fixes the "one random scene has no audio" bug.
      const audioFixedCode = enforceCorrectAudioUrls(fixedCode, scenes);

      const validatedCode = validateGeneratedCode(audioFixedCode, componentName, totalFrames);

      const review = await reviewGeneratedCode(validatedCode, lesson);
      if (!review.skipped && review.ok === false) {
        // Previously this only logged a warning and returned the flagged
        // code anyway, so the critic's findings never actually protected
        // anything. Now a failed review counts as a failed attempt and
        // triggers a regeneration, same as any other validation failure.
        throw new Error(
          `Code critic flagged issues: ${review.issues?.join("; ") || "unspecified"}`
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
        `  [code] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`
      );
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
  throw new Error(
    `Failed to generate valid lesson code after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

module.exports = { generateCoursePlan, generateLessonCode };