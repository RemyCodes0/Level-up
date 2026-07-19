const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const JSZip = require("jszip");
const { validateGeneratedCode } = require("./validateCode");
const { reviewGeneratedCode } = require("./codeCriticService");
const { createLimiter } = require("../utils/concurrencyLimiter");

// GLM-5.2 client for lesson code generation — OpenAI-compatible
const glmClient = new OpenAI({
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.z.ai/api/paas/v4/",
  timeout: 300 * 1000, // 5 minute timeout — if GLM takes longer, fail fast and retry
  maxRetries: 0,       // handle retries manually
});

// DeepSeek client for lesson code generation — also OpenAI-compatible, so the
// same SDK works with just a different baseURL/key.
const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 300 * 1000,
  maxRetries: 0,
});

// Claude Fable 5 via Anthropic's OpenAI-COMPATIBLE endpoint, so it slots into
// the same streaming .chat.completions loop as GLM/DeepSeek with no rewrite.
// Fable 5 is a much stronger creative-code model, but MUCH pricier (~$15/$75
// per M tokens vs GLM's cents) — used deliberately for ads (low volume, one
// per user action), not the 6-lessons-per-course code path.
const fableClient = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com/v1/",
  timeout: 300 * 1000,
  maxRetries: 0,
});

// ── Code-gen provider table ───────────────────────────────────────────────────
// Each entry bundles everything that differs between providers so the
// generation code below stays provider-agnostic. Lesson code and ad code are
// selected INDEPENDENTLY (see LESSON_CODE_PROVIDER / AD_CODE_PROVIDER below).
const CODE_PROVIDERS = {
  glm: {
    client: glmClient,
    model: "glm-5.2",
    // thinking disabled = faster + cheaper. The prompt now leans on a short,
    // coherence-first rule set (not brute reasoning) to do the heavy lifting,
    // so extra chain-of-thought buys little here and costs latency on the
    // high-volume 6-lessons-per-course path.
    extraParams: { thinking: { type: "disabled" } },
    maxTokens: 100000,
    keyEnv: "ZAI_API_KEY",
  },
  deepseek: {
    client: deepseekClient,
    model: "deepseek-v4-pro",
    // Tuning notes:
    //  - temperature 0.9 / top_p 0.95: enough variety for distinct, concept-
    //    driven scenes without the wild swings temp 1.0 produced (which the
    //    old "cram in maximum density" prompt leaned on but which also fed the
    //    off-model, incoherent output we're now designing against).
    //  - reasoning_effort "high" (was "max"): the new prompt asks the model to
    //    illustrate ONE concept coherently per scene rather than plan a 50-
    //    element pile-up, so it needs far less planning budget. "high" recovers
    //    most of "max"'s planning depth at a fraction of the latency — the
    //    single biggest lever on the "slow to generate" complaint. Bump back to
    //    "max" per-deploy only if a specific topic class regresses.
    extraParams: {
      reasoning_effort: "high",
      thinking: { type: "enabled" },
      temperature: 0.9,
      top_p: 0.95,
    },
    maxTokens: 100000,
    keyEnv: "DEEPSEEK_API_KEY",
  },
  fable: {
    client: fableClient,
    model: "claude-fable-5",
    // Fable 5's max output is far lower than GLM's, so cap max_tokens or the
    // request errors. 32k is plenty for an ad composition.
    extraParams: { temperature: 1.0 },
    maxTokens: 32000,
    keyEnv: "ANTHROPIC_API_KEY",
  },
};

function resolveProvider(envVar, defaultKey) {
  const requested = process.env[envVar];
  const provider = CODE_PROVIDERS[["fable", "deepseek", "glm"].includes(requested) ? requested : defaultKey];
  if (!process.env[provider.keyEnv]) {
    console.warn(`[codegen] WARNING: ${provider.keyEnv} is not set — ${envVar} generation will fail with an auth error.`);
  }
  return provider;
}

// Lesson code (6 per course, high volume) → GLM-5.2 by default: fast, cheap,
// handles concurrent requests well. Override per-deploy with LESSON_CODE_MODEL.
const LESSON_CODE_PROVIDER = resolveProvider("LESSON_CODE_MODEL", "glm");
// Ad code (one per user action, low volume) → Fable 5 by default: the
// stronger, pricier model, affordable specifically because ad volume is low.
// Override per-deploy with AD_CODE_MODEL.
const AD_CODE_PROVIDER = resolveProvider("AD_CODE_MODEL", "fable");

console.log(
  `[codegen] lesson code → ${LESSON_CODE_PROVIDER.model} (set LESSON_CODE_MODEL=fable | deepseek | glm to switch) | ` +
  `ad code → ${AD_CODE_PROVIDER.model} (set AD_CODE_MODEL=fable | deepseek | glm to switch)`
);

// ── Error classification ─────────────────────────────────────────────────────
//   - Transport errors (connection reset, rate limit, 5xx): retry as-is.
//   - Content errors (bad JSON, failed validation, critic rejection): the model
//     produced wrong OUTPUT; fed back into the retry prompt so the next attempt
//     is corrective, not a blind reroll.
//   - Non-retryable errors (401/403 auth): fail immediately.
function contentError(message) {
  const err = new Error(message);
  err.isContentError = true;
  return err;
}

function isNonRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 401 || status === 403;
}

// ── Retry helper with exponential backoff + jitter ──────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backoffDelay(attempt, baseMs = 500, capMs = 8000) {
  const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  const jitter = Math.random() * exp * 0.3;
  await sleep(exp + jitter);
}

// ── Concurrency limiters ─────────────────────────────────────────────────────
// The limited function must cover the ENTIRE request lifetime (open stream +
// consume every chunk), so a slot is held for as long as the socket is open —
// releasing at create()-resolution would allow far more than N sockets at once.
// (Implementation in utils/concurrencyLimiter.js; exportController reuses it.)
const GLM_MAX_CONCURRENT = Number(process.env.GLM_MAX_CONCURRENT) || 6;
const limitLessonCodeCall = createLimiter(GLM_MAX_CONCURRENT);

const AD_CODE_MAX_CONCURRENT = Number(process.env.AD_CODE_MAX_CONCURRENT) || 3;
const limitAdCodeCall = createLimiter(AD_CODE_MAX_CONCURRENT);

// Pull the useful bits out of a connection-level failure. The OpenAI SDK
// collapses network errors into a generic "Connection error." and stashes the
// real cause on err.cause.
function describeError(err) {
  const cause = err?.cause;
  if (!cause) return err.message;
  const causeCode = cause.code || cause.errno || cause.name;
  const causeMsg = cause.message || String(cause);
  return `${err.message} [cause: ${causeCode ? `${causeCode} — ` : ""}${causeMsg}]`;
}

// ── Safer JSON extraction ────────────────────────────────────────────────────
// Walks from a given "{" tracking bracket depth and string state to find the
// actual matching close brace — immune to stray braces inside string values or
// trailing commentary. Returns the balanced slice, or null if never closed.
function extractJsonObjectFrom(text, start) {
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

  return null; // Never closed
}

// Parse strategy, in order of preference:
//   1. Extract a balanced object and JSON.parse it untouched.
//   2. On failure, apply a trailing-comma repair and try once more.
//   3. On failure, advance past this "{" and try the next candidate — recovers
//      the case where prose before the JSON itself contains braces.
function safeParseJson(text) {
  let searchFrom = 0;
  let lastErr = null;

  for (let attempts = 0; attempts < 8; attempts++) {
    const braceAt = text.indexOf("{", searchFrom);
    if (braceAt === -1) break;

    const candidate = extractJsonObjectFrom(text, braceAt);
    if (candidate === null) {
      searchFrom = braceAt + 1;
      continue;
    }

    try {
      return JSON.parse(candidate);
    } catch (pristineErr) {
      try {
        return JSON.parse(candidate.replace(/,(\s*[}\]])/g, "$1"));
      } catch (repairedErr) {
        lastErr = repairedErr;
        searchFrom = braceAt + 1;
      }
    }
  }

  throw contentError(
    `Could not parse a complete JSON object from model output${lastErr ? ` (last parse error: ${lastErr.message})` : ""}`
  );
}

// ── Course plan shape validation ────────────────────────────────────────────
// Parsing succeeds != the plan is usable. The prompt promises 6 lessons with
// exactly 4 keyPoints each and 20 questions with valid option/answer shapes.
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
      } else if (lesson.keyPoints.some((kp) => typeof kp !== "string" || !kp.trim())) {
        errors.push(`Lesson ${i + 1}: keyPoints must all be non-empty strings`);
      }
    });
  }

  if (!Array.isArray(plan.questions) || plan.questions.length !== 20) {
    errors.push(`Expected 20 questions, got ${plan.questions?.length ?? "none"}`);
  } else {
    plan.questions.forEach((q, i) => {
      if (!q.question || typeof q.question !== "string") {
        errors.push(`Question ${i + 1}: missing/invalid question text`);
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`Question ${i + 1}: expected 4 options`);
      } else if (q.options.some((o) => typeof o !== "string" || !o.trim())) {
        errors.push(`Question ${i + 1}: options must all be non-empty strings`);
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

// ── PPTX text extraction ─────────────────────────────────────────────────────
// A .pptx is a ZIP of XML parts. Slide text lives in ppt/slides/slideN.xml as
// <a:t>...</a:t> runs; pulling those out per slide feeds the same plain-text
// course-plan prompt used for PDFs/pasted text.
function extractPptxText(buffer) {
  return JSZip.loadAsync(buffer).then(async (zip) => {
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = Number(a.match(/slide(\d+)\.xml$/)[1]);
        const numB = Number(b.match(/slide(\d+)\.xml$/)[1]);
        return numA - numB;
      });

    if (slideFiles.length === 0) {
      throw new Error("No slides found — this doesn't look like a valid .pptx file");
    }

    const decodeXmlEntities = (s) =>
      s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");

    const slideTexts = await Promise.all(
      slideFiles.map(async (name, i) => {
        const xml = await zip.files[name].async("string");
        const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
        return runs.length ? `Slide ${i + 1}: ${runs.join(" ")}` : null;
      })
    );

    return slideTexts.filter(Boolean).join("\n\n");
  });
}

function isPptxFile(fileName) {
  return typeof fileName === "string" && fileName.toLowerCase().endsWith(".pptx");
}

async function generateCoursePlan(topic, pdfText, pdfBuffer, sourceFileName, level = null, maxAttempts = 3) {
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

  // GLM-5.2 is an OpenAI-compatible text endpoint — it can't ingest raw
  // document bytes. When a file was uploaded, extract its text first (PDF via
  // pdf-parse, PPTX via extractPptxText) and feed it through the same plain-
  // text path as the pdfText case (capped at MAX_PDF_TEXT_CHARS).
  let effectivePdfText = pdfText;
  if (pdfBuffer) {
    const isPptx = isPptxFile(sourceFileName);
    try {
      effectivePdfText = isPptx ? await extractPptxText(pdfBuffer) : (await pdfParse(pdfBuffer)).text;
    } catch (err) {
      throw new Error(`Failed to extract text from uploaded ${isPptx ? "PPTX" : "PDF"}: ${err.message}`);
    }
  }

  const truncated = Boolean(effectivePdfText && effectivePdfText.length > MAX_PDF_TEXT_CHARS);
  const context = effectivePdfText
    ? `The student uploaded course material:\n\n${effectivePdfText.slice(0, MAX_PDF_TEXT_CHARS)}`
    : `The student wants to learn about: ${topic}`;

  const messages = [
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

  if (truncated) {
    console.warn(
      `  [plan] pdfText truncated from ${effectivePdfText.length} to ${MAX_PDF_TEXT_CHARS} chars — course plan may miss later sections.`
    );
  }

  let lastError = null;

  // Course plan generation is a bounded, fixed-shape JSON task (6 lessons, 20
  // questions) — it gets no benefit from deep chain-of-thought, and reasoning
  // tokens draw from the SAME max_tokens budget as the JSON output. Strip
  // reasoning_effort and force thinking off for this call, regardless of
  // provider, so the whole budget goes to the JSON.
  const { reasoning_effort: _reasoningEffort, ...planExtraParams } = LESSON_CODE_PROVIDER.extraParams;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await LESSON_CODE_PROVIDER.client.chat.completions.create({
        model: LESSON_CODE_PROVIDER.model,
        ...planExtraParams,
        thinking: { type: "disabled" },
        max_tokens: 8000,
        messages,
      });

      const choice = response.choices?.[0];

      if (choice?.finish_reason === "length") {
        throw contentError(
          "Course plan response hit max_tokens and was truncated — the JSON is incomplete"
        );
      }

      const text = choice?.message?.content || "";
      const plan = safeParseJson(text);

      const { ok, errors } = validateCoursePlan(plan);
      if (!ok) {
        throw contentError(`Course plan failed shape validation: ${errors.join("; ")}`);
      }

      if (truncated) {
        plan.__truncatedInput = true;
      }
      return plan;
    } catch (err) {
      lastError = err;

      if (isNonRetryable(err)) {
        throw new Error(
          `Course plan generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER.keyEnv}): ${describeError(err)}`
        );
      }

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

// ── Remedial lesson plan (collaborative courses) ────────────────────────────
// Generates {title, description, keyPoints} for ONE new lesson targeting the
// group's weakest topic, then hands off to the existing buildLesson pipeline.
// Deliberately re-teaches from a different angle than a first pass would.
async function generateRemedialLessonPlan(courseTopic, weakTopic, groupAvgPct, maxAttempts = 3) {
  const messages = [
    {
      role: "user",
      content: `
You are an expert educational content designer creating ONE remedial lesson for a study group that just took a quiz together.

COURSE TOPIC: ${courseTopic}
The group's quiz results show their weakest area is: "${weakTopic}" (group average score on this topic: ${groupAvgPct}%).

Design ONE focused lesson that re-teaches this specific weak spot. The learners have already seen this material once and got it wrong as a group — do not just repeat a first-pass explanation. Approach it from a different angle: a fresh analogy, a concrete worked example, and an explicit callout of the mistake pattern that's likely causing the low score.

Return ONLY valid JSON, no markdown, exactly this structure:
{
  "title": "string (specific to the weak topic, framed as review/reinforcement, not a generic repeat of the original lesson title)",
  "description": "string (2-3 sentences)",
  "keyPoints": ["string", "string", "string", "string"]
}

Rules:
- Exactly 4 keyPoints
- Content specific to "${weakTopic}", never generic
- Pure JSON only, no backticks
- CRITICAL: Respond with ONLY the JSON object. No commentary, no acknowledgment.
      `,
    },
  ];

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await glmClient.chat.completions.create({
        model: "glm-5.2",
        thinking: { type: "disabled" },
        max_tokens: 2000,
        messages,
      });

      const choice = response.choices?.[0];
      if (choice?.finish_reason === "length") {
        throw contentError("Remedial lesson plan hit max_tokens and was truncated");
      }

      const plan = safeParseJson(choice?.message?.content || "");
      if (
        !plan.title || typeof plan.title !== "string" ||
        !plan.description || typeof plan.description !== "string" ||
        !Array.isArray(plan.keyPoints) || plan.keyPoints.length !== 4
      ) {
        throw contentError("Remedial lesson plan failed shape validation");
      }
      return plan;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Remedial lesson plan generation failed with a non-retryable error (check ZAI_API_KEY): ${describeError(err)}`);
      }
      console.warn(`  [remedial] Attempt ${attempt}/${maxAttempts} failed: ${describeError(err)}. Retrying...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(
    `Failed to generate a remedial lesson plan after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

// ── Continuous learning: next-course suggestions ────────────────────────────
async function generateNextCourseSuggestions(completedTopic, weakTopics = [], maxAttempts = 2) {
  const weakContext = weakTopics.length
    ? `The learner's weaker areas from their quiz results were: ${weakTopics.join(", ")}.`
    : "";

  const messages = [
    {
      role: "user",
      content: `
You are a curriculum advisor. A learner just completed a course on: "${completedTopic}".
${weakContext}

Suggest exactly 3 natural next courses to continue their learning journey — a mix of (a) deepening this exact topic in the areas they were weak on, and (b) a logical next topic that builds on what they just learned.

Return ONLY valid JSON, no markdown, exactly this structure:
{
  "suggestions": [
    { "topic": "string — a specific course topic, phrased the way a user would type it into a search/topic box", "reason": "string — one sentence on why this is a good next step" }
  ]
}

Rules:
- Exactly 3 suggestions
- Topics specific and concrete, never generic ("more math" is bad; "Matrix inverses and determinants" is good)
- Pure JSON only, no backticks, no commentary
      `,
    },
  ];

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await glmClient.chat.completions.create({
        model: "glm-5.2",
        thinking: { type: "disabled" },
        max_tokens: 1000,
        messages,
      });

      const choice = response.choices?.[0];
      const parsed = safeParseJson(choice?.message?.content || "");
      if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length !== 3) {
        throw contentError("Next-course suggestions failed shape validation");
      }
      return parsed.suggestions;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Next-course suggestions generation failed with a non-retryable error (check ZAI_API_KEY): ${describeError(err)}`);
      }
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(
    `Failed to generate next-course suggestions after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LESSON CODE-GEN PROMPT
// ═══════════════════════════════════════════════════════════════════════════
// Design goals of this rewrite (vs. the old "maximum density" prompt):
//
//   1. PERSONALIZED, NOT TEMPLATED. The old prompt mandated a 30-40 particle
//      field + "10+ moving things or REJECTED" in EVERY scene, and its one
//      worked example was a glowing atom with orbiting electrons. Since the
//      model imitates the example harder than any rule, every lesson trended
//      toward the same particle-soup look regardless of topic. Here, the
//      concept's own structure dictates the cast; the worked example is a
//      NON-particle mechanism (binary search) framed purely as a craft/safety
//      reference to copy PATTERNS from, never a visual to reproduce.
//
//   2. COHERENT. Two new levers: (a) a per-lesson VISUAL IDENTITY — one palette
//      + one recurring motif chosen up front and carried across all 6 scenes,
//      so a course reads as one designed piece; (b) motion must be MOTIVATED —
//      every moving element illustrates something, instead of ambient decoration
//      that reads as AI-generated noise.
//
//   3. FASTER. Redundancy removed (the old 6g re-stated 11; self-check
//      duplicated the body). Element-count quotas that inflated output on every
//      one of 6 lessons are gone. Shorter prompt = less attention decay + fewer
//      output tokens = lower latency, the core "slow to generate" complaint.
//
// Crash-safety rules (interpolate shape, clamp, spring fps, undefined guards,
// forbidden imports, duration sum) are UNCHANGED — they are real runtime
// constraints of the browser sandbox, not compensations for model weakness.
const CODE_GEN_STATIC_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "i" (from "import"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer. You build educational animations that a real studio would be proud of: purposeful, cinematic, and — above all — a clear visual explanation of ONE specific concept. Runs-without-crashing and stays-in-frame are the floor, not the goal. The goal is that a viewer who muted the audio would still understand the concept from the motion alone.

════════ PLAN BEFORE YOU CODE (do this in your head, do NOT write it as prose) ════════

STEP 0 — LESSON VISUAL IDENTITY (decide ONCE, apply to EVERY scene):
Every scene in this lesson must feel like part of the SAME designed piece, not six unrelated clips. Before any code, fix:
  • PALETTE: 3-4 colors derived from the SUBJECT, not a default. Biology→living greens; electronics→copper/PCB-green; finance→ink+ledger tones; astronomy→deep space + stellar accents; history→parchment/sepia. One background base, one primary accent (the "hero" color), one or two supporting hues. Reuse these exact colors in every scene.
  • MOTIF: one recurring visual element or geometry that threads through the lesson (a grid, a flowing current, orbital paths, a timeline spine, cells, layers). It reappears — evolved, not copy-pasted — in each scene so the course has a signature.
  • TONE: match motion energy to the subject. A meditation lesson breathes slowly; a rocket-launch lesson is kinetic. Do not give every topic the same restless jitter.

STEP 1 — PER SCENE, work out four things, then build straight to them:
  (1) THE MECHANISM: what process does THIS scene teach, and what BEFORE→AFTER change must visibly happen across its duration (see CRAFT §A).
  (2) THE CAST: the specific elements the concept actually needs — sized to the concept, NOT to a quota. A clean idea shown with 4 well-chosen, well-animated elements beats 40 decorative ones. Add ambient/background motion only where it supports the mood; never as filler.
  (3) THE PACING: 3-5 staged reveals spread across the FULL duration, tracking the narration (see CRAFT §B).
  (4) THE LAYOUT: shared position anchors so connectors/labels/contents line up, every final position clamped to SAFE (see CRAFT §C, and SAFETY §5).

════════ SANDBOX API (violate → build fails) ════════
1. Named export exactly as given below: export const ComponentName = () => { ... }
2. Import ONLY from "remotion" and "react".
   • From "remotion": any named export EXCEPT staticFile (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop).
   • From "react": ONLY useMemo, useCallback, useRef. useState DOES NOT EXIST here and crashes the video.
   • No other imports of any kind.
3. NO props, NO external/dynamic data. Variables like user, session, props, context do not exist — referencing them crashes with "X is not defined". Every identifier must be locally declared, a listed remotion/react export, or a parameter of your own function.
   • NEVER shadow a JS built-in (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set) with a variable/param/prop name — inside that scope the real built-in is gone (e.g. a param named Math makes Math.sin crash).
4. STRUCTURE: a single <Series> with one <Series.Sequence durationInFrames={EXACT}> per scene, IN ORDER. Never a bare <Sequence> anywhere — a nested <Sequence> unmounts its children when its own (often shorter) duration elapses, so the visual vanishes while the audio keeps playing. To show something for only part of a scene, drive its opacity/scale with interpolate() on an always-mounted element.
5. Copy each durationInFrames number EXACTLY — never compute or round it. Sum of all durations MUST equal the given TOTAL FRAMES.
6. Each sequence contains <Audio src={"EXACT_URL"} /> — no staticFile() wrapper. URLs carry long random hex IDs; one wrong character silently 404s that scene's audio. (A downstream pass also repairs these, but copy them right anyway.)
7. FRAME NUMBERS ARE PER-SCENE. useCurrentFrame() resets to 0 at the start of EVERY <Series.Sequence>. Never offset a timing by earlier scenes' durations — an entrance written as interpolate(frame, [1240, 1270], ...) in scene 5 never fires. Entrances live near [0, 30]; exits near [thisSceneDuration - 30, thisSceneDuration], written as literals of THIS scene's own duration.

════════ CRASH-SAFETY (each one is a real runtime crash — no exceptions) ════════
S1. interpolate(value, inputRange, outputRange, options?) — exactly 3 args + optional options object.
    • inputRange and outputRange are ARRAY LITERALS of plain number literals, written inline: [0, 20]. NEVER a variable holding an array, NEVER an expression inside the array (no [start, start+20], no [end-30, end], no [i*8]). If a value must vary, shift the FIRST argument instead: interpolate(frame - i * 8, [0, 20], [0, 1], CLAMP).
    • inputRange strictly increasing, no repeats. [0, 30, 60, 60] crashes — bump the dupe: [0, 30, 60, 61].
    • For hold-at-final: 2 points + CLAMP, e.g. interpolate(frame, [0, 30], [0, 1], CLAMP).
    • const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" }; use it on entrance/exit interpolations so they don't overshoot. (Continuous Math.sin/cos motion needs no CLAMP.)
S2. spring() MUST receive both frame AND fps: spring({ frame, fps, config: {...} }) with const { fps } = useVideoConfig() inside the component. Missing fps throws.
S3. Never emit NaN into any SVG/style number (cx, cy, r, x, y, width, height, points, d, transforms):
    • Guard division: value / (denom || 1). Guard array access before use.
    • Math.sin/cos always get a plain finite number.
    • Filter polyline/polygon points: pts.filter(p => !isNaN(p.x) && !isNaN(p.y)).
S4. Never read a property off a possibly-undefined value ("Cannot read properties of undefined"):
    • Consecutive access: when a loop body reads arr[i+1] (connecting point i to i+1), iterate only to length-1 — arr.slice(0,-1).map((p,i)=>{ const next = arr[i+1]; ... }) — or guard: if (!next) return null;
    • Lookups that can miss (find(), map[key], arr[idx]): guard the result before reading .x/.y/.length.
S5. THE 1920x1080 FRAME IS A HARD BOUNDARY. Every final x/y/cx/cy/top/left/translate value MUST pass through clamp() to SAFE as its LAST step. Define once, route everything through it:
      const FRAME = { w: 1920, h: 1080 };
      const SAFE = { xMin: 160, xMax: 1760, yMin: 140, yMax: 940 };
      const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    • Oscillating: compute base ± amp*sin, THEN clamp — never assume it "stays in range".
    • Orbiting: radius ≤ min(centerX-SAFE.xMin, SAFE.xMax-centerX, centerY-SAFE.yMin, SAFE.yMax-centerY). For center (960,540), radius ≤ 420 is always safe.
    • Text: also leave ≥80px margin inside SAFE, since text has width/height beyond its anchor.
    • When generating random positions, generate INSIDE SAFE from the start — SAFE.xMin + Math.random()*(SAFE.xMax-SAFE.xMin) — not Math.random()*1920 then clamp (that piles everything onto the boundary).

════════ SYNTAX TRAPS (silent break or parse error) ════════
Y1. JSX style objects and SVG attributes are camelCase, never kebab: backgroundColor, fontSize, borderRadius, boxShadow, textShadow, zIndex, justifyContent (not background-color…); strokeWidth, strokeLinecap, strokeDasharray, textAnchor, fillOpacity, clipPath (not stroke-width…). Kebab keys are silently ignored or a syntax error.
Y2. JSX attribute names differ from HTML: class → className, for → htmlFor.
Y3. Prefer string concatenation ("a" + b + "c") over template literals for dynamic colors/transforms/paths — zero risk of an unbalanced backtick. If you do use a template literal, every backtick must be paired (total count even); one stray backtick corrupts the whole rest of the file.
Y4. Never put comma-separated expressions bare in JSX braces ({a, b} is invalid). Never write a literal { or } as JSX text ("f(x) = {x}" breaks parsing) — write braces as string expressions {"{"} or reword to avoid them.
Y5. Any wrapper component you nest content inside MUST accept and render {children} ({ children }: { children?: React.ReactNode } … then {children} in its body). A wrapper missing {children} silently drops everything inside it — the #1 cause of blank scenes. If unsure, put the background as a sibling <AbsoluteFill> BEHIND the content instead of wrapping it.

════════ ANIMATION CRAFT — this is where the product lives ════════

§A — ILLUSTRATE THE MECHANISM, NOT A LABELED PICTURE. The single most common failure is a static shape with a name on it instead of the actual process happening. Show the BEFORE state becoming the AFTER state across the scene:
   • DNA replication → base pairs actually SEPARATING one by one, new bases animating in to pair with each exposed strand — not two lines labeled 5'/3'.
   • Cell division → for each phase, the real structures move: chromosomes condense and line up, spindle fibers extend, the membrane pinches — not a wheel with phase names spinning.
   • Enzyme activity → the enzyme shape travels ALONG the substrate with a visible change at the contact point — not a static blob labeled "enzyme".
   • Sorting → elements actually swap into order; binary search → the search window actually narrows.
   Test: paused at start / middle / end, does the frame look MEANINGFULLY different, reflecting real progress? If it's the same picture with a title fading in, it FAILS — no amount of background decoration rescues it.
   BINDING SPEC: each scene below has a visualDescription (implement the specific elements/actions it names — not a different visual you'd prefer) and onScreenText (render VERBATIM as the scene's primary text, plus at most brief supporting labels — never paraphrase or replace it).

§B — MOTION IS CONTINUOUS BUT MOTIVATED.
   • No frozen frames: something is always in gentle motion (Math.sin(frame/k) breathing, drift, the mechanism progressing). But motion must MEAN something — it illustrates the concept or sets the mood. Avoid restless decorative jitter that has nothing to do with the topic; that is precisely what makes an animation read as generated filler.
   • Pace across the FULL duration. The scene's frames match its narration — break content into 3-5 stages and stagger their reveals across the whole timeline (for a 450-frame scene, roughly frames 0 / 90 / 210 / 330 as literals), with the mechanism visibly advancing between reveals. A scene fully built by frame 60 that merely wobbles for the remaining 390 FAILS: the viewer watches nothing new while the narrator keeps talking.
   • Entrances feel intentional: use spring() for a couple of key elements so they arrive with weight; give elements with continuous motion DIFFERENT sin/cos periods and phases so nothing moves in robotic lockstep.

§C — SPATIAL COHERENCE. Elements that relate must share ONE source of truth for position — this is the #1 cause of a scene that runs but looks WRONG (an arrow pointing at nothing, a label drifting off its target, particles spilling out of a beaker).
   • Compute each anchor ONCE into a named const; every dependent element (connector endpoint, label, contained particle) READS that same const. Never type a related coordinate twice.
     const enzyme = { x: 700, y: 540 };
     <line x1={enzyme.x} y1={enzyme.y} ... />   // reuse — do not re-type 720/560
   • Moving target: compute the live animated position once; the element AND its arrow/label both read it, so they track together every frame.
   • Containment: derive a container's inner region from the SAME geometry you drew the container with, and clamp contents into it — never guess "inside" coordinates independently.
   • Proportion: the main diagram dominates (~40-60% of frame width) in the non-text zone; labels are subordinate to what they label; contained items are a small fraction of their container; clamp any animated size to a sane range (a radius formula that can hit 0 or 900 is a bug).

§D — READABLE TEXT LAYER. Reserve a clear band for text (a bottom band ~y 860-960 or a top band ~y 120-220) and keep the diagram — including its full motion range — OUT of it. Give text a zIndex above the diagram plus a textShadow (or subtle dark backing) for contrast over any color. Body ≥28px, titles ≥36px. Never overlap two text blocks: fade old text fully OUT before new text reaches full opacity.

════════ CODE QUALITY ════════
- Inline styles only (no Tailwind, no className for styling, no external CSS). No registerRoot, no Composition.
- Extract shared helpers at the top (e.g. a Motif component, a Label, an ambient layer) and reuse them across scenes — this is how the lesson's visual identity stays consistent AND keeps each scene concise.
- Scene length follows the concept: as long as it needs to illustrate the mechanism well, no longer. Don't pad to hit a line count.
- Every <Series.Sequence> has a positive integer durationInFrames ≥ 1.

════════ WORKED EXAMPLE — COPY THE PATTERNS, NOT THE PICTURE ════════
This example exists to show you the SAFE PATTERNS (clamp usage, staggered interpolate, spring+fps, shared-anchor coherence, staged reveals, mechanism illustration) and the density of CRAFT expected. It is deliberately NOT particles-and-glowing-orbs. Your scene's actual visual must be invented from YOUR concept and YOUR lesson palette — do NOT reproduce this array/search look unless your topic genuinely is search. Study HOW it's built; then build something else.

\`\`\`tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 160, xMax: 1760, yMin: 140, yMax: 940 };
const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// LESSON MOTIF: a soft moving gradient wash in the lesson palette, reused as
// the base layer of every scene so the course reads as one piece. Mood motion
// only — it supports atmosphere, it is not the "content".
function Backdrop({ from = "#0b1f3a", to = "#05060f" }: { from?: string; to?: string }) {
  const frame = useCurrentFrame();
  const shift = 45 + Math.sin(frame / 60) * 10; // slow, calm — matches a "how search works" tone
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% " + shift + "%, " + from + ", " + to + " 70%)" }} />
  );
}

// One array cell. Its highlight state is DRIVEN by the search window, so the
// visual literally shows the algorithm's progress (mechanism, not a label).
function Cell({ x, y, value, state }: { x: number; y: number; value: number; state: "in" | "out" | "target" }) {
  const bg = state === "target" ? "#22d3a0" : state === "in" ? "#2b3f6b" : "#151a2e";
  const glow = state === "target" ? "0 0 26px #22d3a0aa" : state === "in" ? "0 0 14px #2b3f6b88" : "none";
  const cx = clampPos(x, SAFE.xMin, SAFE.xMax);
  const cy = clampPos(y, SAFE.yMin, SAFE.yMax);
  return (
    <div style={{
      position: "absolute", left: cx - 44, top: cy - 44, width: 88, height: 88,
      borderRadius: 14, backgroundColor: bg, boxShadow: glow,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#eaf0ff", fontSize: 34, fontWeight: 700,
      opacity: state === "out" ? 0.4 : 1, transition: "none",
    }}>{value}</div>
  );
}

// The scene. The search window (lo..hi) NARROWS across the duration in staged
// steps — before → after progress the viewer can read without the audio.
function BinarySearchScene({ title }: { title: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arr = [3, 8, 12, 19, 27, 34, 41, 55, 63, 70, 78, 92];
  const targetIdx = 9; // value 70
  const n = arr.length;

  // Staged narrowing: each step shrinks the window. Steps are spread across the
  // FULL duration (§B) via a value-shifted interpolate so inputRanges stay
  // literal (S1). One shared "step" number is the single source of truth for
  // BOTH which cells are highlighted AND where the pointer sits (§C).
  const step = Math.floor(interpolate(frame, [20, 300], [0, 4], CLAMP));
  const windows = [
    { lo: 0, hi: 11 }, { lo: 6, hi: 11 }, { lo: 6, hi: 8 }, { lo: 9, hi: 9 }, { lo: 9, hi: 9 },
  ];
  const w = windows[Math.min(step, windows.length - 1)];       // guarded index (S4)
  const mid = Math.floor((w.lo + w.hi) / 2);

  // Row geometry computed once; cells AND the pointer read from it (§C).
  const rowY = 520;
  const gap = 118;
  const startX = 960 - ((n - 1) * gap) / 2;
  const cellX = (i: number) => startX + i * gap;

  const pointerX = clampPos(cellX(mid), SAFE.xMin, SAFE.xMax);
  const pointerDrop = spring({ frame: frame - step * 12, fps, config: { damping: 12, stiffness: 90 } });

  const titleOpacity = interpolate(frame, [8, 34], [0, 1], CLAMP);
  const foundOpacity = interpolate(frame, [280, 320], [0, 1], CLAMP);

  return (
    <AbsoluteFill>
      <Backdrop from="#0b1f3a" to="#05060f" />

      {arr.map((v, i) => {
        const inWindow = i >= w.lo && i <= w.hi;
        const isTarget = i === targetIdx && step >= 3;
        const state = isTarget ? "target" : inWindow ? "in" : "out";
        return <Cell key={i} x={cellX(i)} y={rowY} value={v} state={state} />;
      })}

      {/* Pointer at the current midpoint — reuses pointerX/rowY, so it can never drift off the cell it marks (§C) */}
      <div style={{
        position: "absolute", left: pointerX - 16, top: clampPos(rowY - 110, SAFE.yMin, SAFE.yMax),
        width: 0, height: 0, borderLeft: "16px solid transparent", borderRight: "16px solid transparent",
        borderTop: "22px solid #f5b642", transform: "translateY(" + pointerDrop * 8 + "px)",
        filter: "drop-shadow(0 0 10px #f5b64288)",
      }} />

      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", zIndex: 5 }}>
        <div style={{ color: "#eaf0ff", fontSize: 46, fontWeight: 800, opacity: titleOpacity, textShadow: "0 2px 20px rgba(0,0,0,0.9)" }}>{title}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, textAlign: "center", zIndex: 5 }}>
        <div style={{ color: "#22d3a0", fontSize: 34, fontWeight: 700, opacity: foundOpacity, textShadow: "0 2px 16px rgba(0,0,0,0.9)" }}>Found 70 in 4 steps</div>
      </div>
    </AbsoluteFill>
  );
}

export const LessonExample = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={330}>
        <Audio src={"https://example.com/audio/scene1.mp3"} />
        <BinarySearchScene title="Binary search halves the problem each step" />
      </Series.Sequence>
    </Series>
  );
};
\`\`\`

Notice: the window NARROWS across the whole duration (staged progress, §B), the pointer reads the SAME geometry as the cells so it always lands on one (§C), highlight state is DRIVEN by the algorithm so the motion literally teaches it (§A), every position is clamped (S5), the interpolate ranges are literals (S1), spring gets fps (S2), the index lookup is guarded (S4). Reproduce these HABITS on a totally different visual built from your own concept and palette.

════════ FINAL PASS (verify silently, fix before returning) ════════
• One <Series.Sequence> per scene, in order, durations copied exactly, summing to TOTAL FRAMES; each has its <Audio> with the exact URL.
• No useState / bare <Sequence> / staticFile / non-remotion,react imports.
• Every interpolate: 3 args, literal number arrays, strictly-increasing inputRange. Every spring has fps. Every final position clamped to SAFE (S5). Every arr[i+1]/find()/lookup guarded (S4).
• Every style key camelCase; no class=/for=; backtick count even; no bare braces in JSX text; every content-wrapper renders {children}.
• Each scene: motion on every frame but motivated (§B); the mechanism visibly progresses start→end (§A); onScreenText rendered verbatim, legible, non-overlapping (§D); related elements share one anchor (§C).
• The lesson reads as ONE piece: same palette and recurring motif across all scenes; the cast of each scene is sized to its concept, not padded.

Begin with imports, then CLAMP / FRAME / SAFE / clampPos, then shared helpers (your motif + a Label), then each scene component, then the exported main component. Your entire response is the code file, first characters "import", no text or fences around it.
`;

// ── DeepSeek-specific prompt ────────────────────────────────────────────────
// CODE_GEN_STATIC_RULES works as-is for GLM and Fable. DeepSeek benefits from
// one short, XML-tagged reminder of the judgment call that a smaller model is
// likeliest to let slide over a long prompt — now COHERENCE, not raw density.
// One gate (not the old primacy+recency pair) is enough with the shorter body,
// and saves tokens/latency. Crash-safety rules are inherited verbatim.
const DEEPSEEK_COHERENCE_GATE = `<coherence_gate priority="critical">
Before writing any scene, lock the lesson's VISUAL IDENTITY (one subject-derived palette + one recurring motif) and reuse it in every scene, and for each scene decide the MECHANISM it must show (before→after) plus a cast of elements sized to that concept — not a fixed quota of decorative particles. Every moving thing must either illustrate the concept or set the mood; cut motion that does neither. The failure to avoid is two different things at once: a static labeled picture with no real progress, OR a generic particle-field that looks identical across unrelated topics. Aim for a scene that teaches the concept through its motion and clearly belongs to THIS lesson.
</coherence_gate>
`;

const DEEPSEEK_CODE_GEN_RULES = DEEPSEEK_COHERENCE_GATE + CODE_GEN_STATIC_RULES;

function selectCodeGenSystemPrompt(provider) {
  return provider.model.startsWith("deepseek") ? DEEPSEEK_CODE_GEN_RULES : CODE_GEN_STATIC_RULES;
}

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
${lesson.description ? "LESSON SUMMARY: " + lesson.description + "\n" : ""}COMPONENT NAME: ${componentName}
TOTAL FRAMES: ${totalFrames}
TOTAL SCENES: ${scenes.length}

FIRST, before coding: derive this lesson's VISUAL IDENTITY from "${lesson.title}" — a 3-4 color palette rooted in the subject (not a default) and one recurring motif — and apply it consistently across ALL scenes below so the course reads as one designed piece. Then build one <Series.Sequence> per scene, IN THIS EXACT ORDER, with these EXACT durations. Size each scene's cast to what its concept needs; illustrate the mechanism (before→after), don't just label it.

SCENES (in order):

${sceneTable}
`;
}

// ── Auto-fix common code-generation errors ───────────────────────────────────
// Text-level (not AST) fixes for systematic model slips. Kept deliberately
// narrow: only fixes with a very low false-positive surface; anything ambiguous
// THROWS to trigger a corrective regeneration rather than shipping mangled code;
// every fire logs what it changed.
function autoFixCode(code, { totalFrames } = {}) {
  let fixed = code;
  const notes = [];

  // Fix 1: kebab-case CSS property names → camelCase (in object-literal keys).
  const cssPropertyMap = {
    "transform-origin": "transformOrigin",
    "background-color": "backgroundColor",
    "font-size": "fontSize",
    "font-weight": "fontWeight",
    "font-family": "fontFamily",
    "border-radius": "borderRadius",
    "box-shadow": "boxShadow",
    "text-shadow": "textShadow",
    "letter-spacing": "letterSpacing",
    "line-height": "lineHeight",
    "text-align": "textAlign",
    "z-index": "zIndex",
    "flex-direction": "flexDirection",
    "justify-content": "justifyContent",
    "align-items": "alignItems",
    "pointer-events": "pointerEvents",
  };
  for (const [kebab, camel] of Object.entries(cssPropertyMap)) {
    const pattern = new RegExp(`["']?${kebab}["']?\\s*:`, "g");
    let count = 0;
    fixed = fixed.replace(pattern, () => {
      count++;
      return `${camel}:`;
    });
    if (count) notes.push(`renamed CSS property ${kebab} -> ${camel} (x${count})`);
  }

  // Fix 1b: kebab-case SVG attributes in JSX (anchored on "=" so it can't touch
  // style-object keys or prose).
  const svgAttrMap = {
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray",
    "stroke-dashoffset": "strokeDashoffset",
    "stroke-opacity": "strokeOpacity",
    "fill-opacity": "fillOpacity",
    "text-anchor": "textAnchor",
    "dominant-baseline": "dominantBaseline",
    "clip-path": "clipPath",
  };
  for (const [kebab, camel] of Object.entries(svgAttrMap)) {
    const pattern = new RegExp(`\\b${kebab}=`, "g");
    let count = 0;
    fixed = fixed.replace(pattern, () => {
      count++;
      return `${camel}=`;
    });
    if (count) notes.push(`renamed SVG attribute ${kebab} -> ${camel} (x${count})`);
  }

  // Fix 2: duplicate/non-increasing inputRange in interpolate() — only when the
  // whole inputRange is plain numeric literals (anything with a variable skipped).
  fixed = fixed.replace(
    /interpolate\s*\(\s*([^,]+),\s*\[([^\]]+)\]/g,
    (match, value, rangeStr) => {
      const parts = rangeStr.split(",").map((s) => s.trim());
      const nums = parts.map(Number);
      if (nums.some((n) => Number.isNaN(n))) return match;
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

  // Fix 2b: unbounded Math.random() * 1920 / * 1080 used directly as a position
  // → safely-inset range (100px margin), so stray elements don't drift off-frame.
  let widthFixCount = 0;
  fixed = fixed.replace(/Math\.random\(\)\s*\*\s*1920(?!\d)/g, () => {
    widthFixCount++;
    return "(100 + Math.random() * 1720)";
  });
  if (widthFixCount) {
    notes.push(`clamped unbounded Math.random() * 1920 position to a safe inset range (x${widthFixCount})`);
  }
  let heightFixCount = 0;
  fixed = fixed.replace(/Math\.random\(\)\s*\*\s*1080(?!\d)/g, () => {
    heightFixCount++;
    return "(100 + Math.random() * 880)";
  });
  if (heightFixCount) {
    notes.push(`clamped unbounded Math.random() * 1080 position to a safe inset range (x${heightFixCount})`);
  }

  // Fix 3: bare `durationInFrames` used out of scope → substitute totalFrames.
  // Left alone if the code DECLARES the identifier anywhere (destructure/param),
  // and property access (scene.durationInFrames) is excluded via lookbehind.
  const declaresDurationInFrames =
    /(?:const|let|var)\s+durationInFrames\b/.test(fixed) ||
    /(?:const|let|var)\s*\{[^{}]*\bdurationInFrames\b[^{}]*\}\s*=/.test(fixed) ||
    /\(\s*\{[^{}]*\bdurationInFrames\b[^{}]*\}/.test(fixed);

  const bareUsePattern = /(?<!\.)\bdurationInFrames\b(?!\s*[=:])/;
  if (!declaresDurationInFrames && bareUsePattern.test(fixed)) {
    const fallback = Number.isFinite(totalFrames) ? totalFrames : null;
    if (fallback === null) {
      throw contentError(
        "Code references out-of-scope `durationInFrames` and no totalFrames was provided to safely substitute — regenerating."
      );
    }
    notes.push(`substituted out-of-scope durationInFrames -> ${fallback}`);
    fixed = fixed.replace(/(?<!\.)\bdurationInFrames\b(?!\s*[=:])/g, `${fallback}`);
  }

  // Fix 4: HTML-attribute-in-JSX slips. (`\bfor=` is case-sensitive and cannot
  // touch `htmlFor=`; `for (` loops have no "=" and are untouched.)
  fixed = fixed.replace(/\bclass=/g, "className=");
  fixed = fixed.replace(/\bfor=/g, "htmlFor=");

  // Fix 5: unterminated template literal → fail loudly (guessing a closer only
  // produces a new kind of invalid code).
  const backtickCount = (fixed.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    throw contentError("Unterminated template literal detected — regenerating instead of guessing a fix.");
  }

  if (notes.length) {
    console.log(`  [autofix] Applied: ${notes.join(" | ")}`);
  }

  return fixed;
}

// ── Enforce correct audio URLs — don't trust the model to transcribe UUIDs ───
// Scenes are always wired IN ORDER, so match each <Audio src> occurrence to the
// corresponding scene's guaranteed-correct URL and force-replace on mismatch.
// Matches both src={"url"} and the plain src="url" slip.
function enforceCorrectAudioUrls(code, scenes) {
  let sceneIndex = 0;
  let mismatchCount = 0;
  let audioTagCount = 0;

  const audioSrcPattern = /<Audio\b[^>]*?src=(?:\{\s*"([^"}]+)"\s*\}|"([^">]+)")/g;

  const fixed = code.replace(audioSrcPattern, (match, bracedUrl, plainUrl) => {
    audioTagCount++;
    if (sceneIndex >= scenes.length) return match;
    const foundUrl = bracedUrl ?? plainUrl;
    const correctUrl = scenes[sceneIndex].audioUrl;
    sceneIndex++;

    if (foundUrl !== correctUrl) {
      mismatchCount++;
      console.warn(
        `  [audio-url-fix] Scene ${sceneIndex}: model wrote a URL that doesn't match the real file — correcting it.\n` +
        `    Model wrote:  ${foundUrl}\n` +
        `    Correct URL:  ${correctUrl}`
      );
      return match.replace(foundUrl, correctUrl);
    }
    return match;
  });

  if (audioTagCount !== scenes.length) {
    console.warn(
      `  [audio-url-fix] Structural mismatch: expected ${scenes.length} <Audio> tags (one per scene), found ${audioTagCount}. Leaving for validateGeneratedCode to reject if invalid.`
    );
  }
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
  // Content-error feedback: a rejection (validation/critic/truncation) is fed
  // back so the next attempt is corrective, not a blind reroll. Transport
  // failures don't set this (the prompt wasn't the problem).
  let contentFeedback = null;
  const lessonStart = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let receivedFullOutput = false;

    try {
      console.log(`  [code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`);

      const userContent =
        buildPerLessonContent(lesson, componentName, scenes, totalFrames) +
        (contentFeedback
          ? `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${contentFeedback}"\nRegenerate the code from scratch and make absolutely sure this specific problem does not occur again.`
          : "");

      // The ENTIRE request lifetime (open stream + consume every chunk) runs
      // inside the limiter, so a concurrency slot is held while the socket is
      // open — not released at create()-resolution.
      const { text, stopReason } = await limitLessonCodeCall(async () => {
        const stream = await LESSON_CODE_PROVIDER.client.chat.completions.create({
          model: LESSON_CODE_PROVIDER.model,
          ...LESSON_CODE_PROVIDER.extraParams,
          max_tokens: LESSON_CODE_PROVIDER.maxTokens ?? 100000,
          stream: true,
          messages: [
            { role: "system", content: selectCodeGenSystemPrompt(LESSON_CODE_PROVIDER) },
            { role: "user", content: userContent },
          ],
        });

        let streamedText = "";
        let finishReason = null;
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) streamedText += delta.content; // ignore reasoning_content
          if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
        }
        return { text: streamedText, stopReason: finishReason };
      });

      receivedFullOutput = true;

      if (stopReason === "length") {
        throw contentError("Hit max_tokens — code was truncated. Generate more compact code.");
      }

      // Strip markdown fences only at the very start/end (a global strip could
      // eat backticks inside the code's own template literals).
      let code = text.trim();
      code = code
        .replace(/^```(?:tsx|typescript|ts|jsx|js)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      if (
        !code.startsWith("import") &&
        !code.startsWith("const") &&
        !code.startsWith("//") &&
        !code.startsWith("/*") &&
        !code.startsWith("export")
      ) {
        throw contentError("Model output plain text instead of TSX code — you MUST output only TSX code starting with `import`.");
      }

      const fixedCode = autoFixCode(code, { totalFrames });
      const audioFixedCode = enforceCorrectAudioUrls(fixedCode, scenes);
      const validatedCode = validateGeneratedCode(audioFixedCode, componentName, totalFrames);

      const review = await reviewGeneratedCode(validatedCode, lesson);
      if (!review.skipped && review.ok === false) {
        throw contentError(
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

      if (isNonRetryable(err)) {
        throw new Error(
          `Lesson code generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER.keyEnv}): ${describeError(err)}`
        );
      }

      if (err.isContentError || receivedFullOutput) {
        contentFeedback = err.message;
      }

      console.warn(`  [code] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
  throw new Error(
    `Failed to generate valid lesson code after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AD GENERATION — same sandbox/provider/autofix/validate machinery as lessons,
// ad-tuned prompt. An ad is ONE component (a <Series> of short punchy scenes).
// Crash-safety is identical; aesthetic is commercial, not educational.
// ═══════════════════════════════════════════════════════════════════════════
const AD_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TSX code. No prose, no markdown. FIRST character "i" (from "import"). CODE ONLY.

You are an elite motion-graphics director making a 30–60s PRODUCT AD — Apple-keynote caliber. Slick, fast, confident, and every scene sells. Build to each scene's EXACT frame duration.

════════ BRAND IDENTITY FIRST (decide once, apply throughout) ════════
Lock a cohesive 2-3 color scheme built around the BRAND COLOR given below (accents, gradients, glows, CTA), one display type treatment, and one motion signature. Everything after obeys it — no random colors, no clashing styles between scenes.

════════ SANDBOX API (violate → build fails) ════════
1. Named export exactly as given: export const ComponentName = () => { ... }
2. Import ONLY from "remotion" (any named export EXCEPT staticFile: AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, Img, Easing, interpolateColors, random, Loop) and "react" (ONLY useMemo, useCallback, useRef — NEVER useState, it crashes).
3. NO props, NO external data. Every variable is locally declared, a listed remotion/react export, or your own param. Never shadow a JS built-in (Math, Array, Object, Date…).
4. A single <Series> with one <Series.Sequence durationInFrames={EXACT}> per scene, IN ORDER. No bare <Sequence>. Copy durations exactly; they must sum to the total.
5. Each sequence has its <Audio src={"EXACT_URL"} /> — copy character-for-character, no staticFile.
6. If logo/screenshot URLs are given below, SHOW them with <Img src={"URL"} /> (animate in — scale/spring/parallax). If none, build a strong typographic/graphic stand-in — never blank space.
7. Frame numbers are PER-SCENE (reset to 0 each Series.Sequence) — never offset by earlier scenes' durations.

════════ CRASH-SAFETY (identical to the lesson sandbox — each is a real crash) ════════
S1. interpolate(value, [literals], [literals], options?) — 3 args + optional options; input/output are literal number arrays only (never a variable/expression inside — shift the value arg: interpolate(frame - i*4, [0,20],[0,1], CLAMP)); inputRange strictly increasing, no dupes. const CLAMP = { extrapolateLeft:"clamp", extrapolateRight:"clamp" }.
S2. spring({ frame, fps, config }) with fps from useVideoConfig().
S3. Guard division (v/(d||1)) and array access; never emit NaN into any SVG/style number.
S4. Never read a property off a possibly-undefined value; guard arr[i+1]/find()/lookups.
S5. Clamp every final position to SAFE: const SAFE = { xMin:160, xMax:1760, yMin:140, yMax:940 }; const clampPos=(v,lo,hi)=>Math.min(hi,Math.max(lo,v)); 1920x1080 is a hard boundary (except deliberate whip-pans that resolve on-screen).

════════ SYNTAX TRAPS ════════
camelCase style keys & SVG attrs (backgroundColor, strokeWidth…); className/htmlFor not class/for; prefer string concat over template literals (even backtick count); no bare commas or literal { } in JSX text; any content-wrapper must render {children}.

════════ AD CRAFT — this is the product ════════
K1. KINETIC TYPOGRAPHY is the backbone: words snap, scale, and stagger in per-word/per-letter (map over split text, stagger via interpolate(frame - i*3, [0,12],[0,1], CLAMP)). Big, bold, confident — headlines 80–160px.
K2. TRANSITIONS ARE THE CRAFT. Scenes are hard cuts, so a clean transition = a coordinated EXIT at the end of one scene + ENTER at the start of the next. Define ONE shared const T (12–16 frames) and reuse it for consistent rhythm; every scene both ENTERS (first T) and EXITS (last T). VARY the technique between beats:
    (a) COVER-WIPE: a brand-color panel sweeps across at the boundary — cover half at the outgoing scene's end (interpolate(frame, [DUR-T, DUR], [-1920, 0], CLAMP)), reveal half at the next scene's start (interpolate(frame, [0, T], [0, 1920], CLAMP)), same direction so it reads continuous.
    (b) DIRECTIONAL SLIDE: outgoing content slides off one edge as incoming slides in from the opposite edge — pair the directions so the eye tracks straight across.
    (c) SCALE/PUNCH: outgoing scales up + fades; incoming springs from 0 — great for the product/logo hero reveal.
   Make reusable <Wipe/> and <SlideIn/> helpers.
K3. CONTINUOUS, MOTIVATED MOTION on every frame — backgrounds drift, elements breathe (Math.sin(frame/k)) — but tied to the brand feel, not random jitter.
K4. STRUCTURE THE ENERGY: hook (biggest type) → tension → PRODUCT/LOGO HERO REVEAL (make it BIG — spring pop + glow burst) → rapid-fire benefits (one punchy beat every ~2-3s) → CTA END CARD (brand color, the exact CTA text below, logo, clean and confident).
K5. DEPTH: layered background (gradient + a few drifting shapes), glow (boxShadow) on hero elements, at least one parallax/orbiting motion. A dense premium frame — never a lone centered word on flat color.

Begin with imports, CLAMP/SAFE/clampPos, shared helpers (AnimatedWord, Wipe, SlideIn, an ambient layer), then the main component. Entire response is the code file, first characters "import", no fences. Make it feel like money.
`;

function buildAdUserContent(ad, componentName, scenes, totalFrames) {
  const assets = [];
  if (ad.logoUrl) assets.push(`LOGO URL (show with <Img>): ${ad.logoUrl}`);
  if (Array.isArray(ad.screenshots) && ad.screenshots.length) {
    ad.screenshots.forEach((s, i) => assets.push(`SCREENSHOT ${i + 1} URL (show with <Img>): ${s}`));
  }
  const sceneTable = scenes
    .map(
      (s, i) =>
        `Scene ${i + 1} [${s.role || "beat"}]: durationInFrames=${s.durationInFrames}, audioUrl="${s.audioUrl}"
   onScreenText: ${s.onScreenText || ""}
   visual: ${s.visualDescription || ""}`
    )
    .join("\n\n");

  return `
PRODUCT: ${ad.productName}
WHAT IT IS: ${ad.description}
BRAND COLOR: ${ad.brandColor || "#6366f1"}
CALL TO ACTION (use verbatim on the end card): ${ad.cta || "Get started today"}
COMPONENT NAME: ${componentName}
TOTAL FRAMES: ${totalFrames}
${assets.length ? "\nBRAND ASSETS:\n" + assets.join("\n") : "\n(No brand assets uploaded — build strong typographic/graphic visuals instead.)"}

SCENES (in order — one <Series.Sequence> each, EXACT durations):

${sceneTable}
`;
}

async function generateAdCode(ad, componentName, scenes, totalFrames, maxAttempts = 3) {
  let lastError = null;
  let contentFeedback = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let receivedFullOutput = false;
    try {
      console.log(`  [ad-code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`);
      const userContent =
        buildAdUserContent(ad, componentName, scenes, totalFrames) +
        (contentFeedback
          ? `\n\n⚠️ PREVIOUS ATTEMPT REJECTED for: "${contentFeedback}"\nRegenerate and fix this specific problem.`
          : "");

      const { text, stopReason } = await limitAdCodeCall(async () => {
        const stream = await AD_CODE_PROVIDER.client.chat.completions.create({
          model: AD_CODE_PROVIDER.model,
          ...AD_CODE_PROVIDER.extraParams,
          max_tokens: AD_CODE_PROVIDER.maxTokens ?? 100000,
          stream: true,
          messages: [
            { role: "system", content: AD_CODE_GEN_RULES },
            { role: "user", content: userContent },
          ],
        });
        let streamedText = "";
        let finishReason = null;
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) streamedText += delta.content;
          if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
        }
        return { text: streamedText, stopReason: finishReason };
      });

      receivedFullOutput = true;
      if (stopReason === "length") {
        throw contentError("Hit max_tokens — ad code truncated. Generate more compact code.");
      }

      let code = text.trim()
        .replace(/^```(?:tsx|typescript|ts|jsx|js)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      if (!/^(import|const|\/\/|\/\*|export)/.test(code)) {
        throw contentError("Model output plain text instead of TSX — output only TSX starting with `import`.");
      }

      const fixedCode = autoFixCode(code, { totalFrames });
      const audioFixedCode = enforceCorrectAudioUrls(fixedCode, scenes);
      const validatedCode = validateGeneratedCode(audioFixedCode, componentName, totalFrames);

      console.log(`  [ad-code] Valid ad code generated (${validatedCode.length} chars) for ${componentName}`);
      return validatedCode;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Ad code generation failed (check ${AD_CODE_PROVIDER.keyEnv}): ${describeError(err)}`);
      }
      if (err.isContentError || receivedFullOutput) contentFeedback = err.message;
      console.warn(`  [ad-code] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }
  throw new Error(
    `Failed to generate valid ad code after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown"}`
  );
}

module.exports = {
  generateCoursePlan,
  generateLessonCode,
  generateAdCode,
  generateRemedialLessonPlan,
  generateNextCourseSuggestions,
};