const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const JSZip = require("jszip");
const { validateGeneratedCode, validateHeaderFragment, validateSceneFragment, getHeaderExposedNames } = require("./validateCode");
const { reviewGeneratedCode } = require("./codeCriticService");
const { createLimiter } = require("../utils/concurrencyLimiter");

// Single OpenRouter client for the code-gen providers still routed through
// it — GLM and Fable 5 are reachable through OpenRouter's OpenAI-compatible
// endpoint under one account/key, instead of separate direct-provider
// clients with separate keys/base URLs. Model choice is just a different
// `model` slug on the SAME client (see CODE_PROVIDERS below).
const openRouterClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 300 * 1000, // 5 minute timeout — fail fast and retry rather than hang
  maxRetries: 0,       // handle retries manually
});

// DeepSeek now goes straight to DeepSeek's own official API instead of
// through OpenRouter — same OpenAI-compatible chat-completions shape, just a
// different base URL/key, so `streamCodeCompletion` below needs no changes.
// This sidesteps the exact problem CODE_PROVIDERS.glm's `provider.order`
// works around for OpenRouter (routing silently landing on a quantized
// third-party backend): hitting the vendor directly means there's no
// routing choice to get wrong.
const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 300 * 1000,
  maxRetries: 0,
});

// ── Code-gen provider table ───────────────────────────────────────────────────
// Each entry bundles everything that differs between providers so the
// generation code below stays provider-agnostic. Lesson code and ad code are
// selected INDEPENDENTLY (see LESSON_CODE_PROVIDER / AD_CODE_PROVIDER below).
const CODE_PROVIDERS = {
  glm: {
    client: openRouterClient,
    model: "z-ai/glm-5.2",
    // Reasoning OFF for per-scene code generation (this is what every
    // generateSceneCode call actually uses) — fastest + cheapest. Was tested
    // at `{ effort: "high" }`; reverted back to disabled. Uses OpenRouter's
    // UNIFIED `reasoning` param (not GLM's native `thinking`/
    // `reasoning_effort` fields) since requests now go through OpenRouter
    // for every provider.
    //
    // `provider: { order: ["z-ai"], allow_fallbacks: true }` PREFERS Z.ai's
    // own official backend for every request, but permits falling back to
    // another provider if Z.ai specifically fails or is unavailable for that
    // request. Without any preference at all, OpenRouter's DEFAULT behavior
    // is to load-balance across ALL providers serving "z-ai/glm-5.2", ordered
    // by PRICE — which can silently route to a heavily quantized (FP4/Int4)
    // third-party backend serving the same model name for cheaper. This is a
    // documented, known issue (GLM-4.7 users hit the same thing as corrupted
    // CJK text; here it manifests as code that passes static validation but
    // crashes at runtime — unguarded property access, malformed interpolate
    // calls, orphaned SVG tags) and is unrelated to the reasoning toggle
    // above — quantization is a routing-time choice made independently of
    // whether reasoning is on.
    //
    // Was `{ only: ["z-ai"] }` (never falls back, ever) — direct testing
    // showed Z.ai's own backend intermittently drops connections under
    // concurrency (firing 10-12 simultaneous requests failed 10-50% of the
    // time across repeated trials, matching real "Connection error
    // [ETIMEDOUT/ENETUNREACH]" failures seen live on several scenes of one
    // lesson). `only` meant those requests had nowhere to go but fail and
    // wait for our own retry loop. `order` + `allow_fallbacks: true` keeps
    // the SAME quality preference for the common case, but lets an
    // individual request that Z.ai can't currently serve fall through to
    // another provider immediately instead of failing outright — accepting
    // occasional quantized-backend output as the tradeoff for fewer outright
    // connection failures under high concurrency.
    extraParams: { reasoning: { enabled: false }, provider: { order: ["z-ai"], allow_fallbacks: true } },
    maxTokens: 100000,
    keyEnv: "OPENROUTER_API_KEY",
  },
  deepseek: {
    client: deepseekClient,
    // Flash, not Pro — first time this project has tried DeepSeek for the
    // actual lesson CODE path (it's already used elsewhere for scene-plan/
    // course-plan JSON, but never for animation code generation itself).
    // No more "deepseek/" vendor prefix — that was OpenRouter's routing
    // namespace, meaningless when talking to DeepSeek's own API directly.
    model: "deepseek-v4-flash",
    // Tuning notes:
    //  - temperature 0.9 / top_p 0.95: enough variety for distinct, concept-
    //    driven scenes without the wild swings temp 1.0 produced (which the
    //    old "cram in maximum density" prompt leaned on but which also fed the
    //    off-model, incoherent output we're now designing against).
    //  - reasoning effort "low": history was "max" -> "high" (dropped for
    //    DeepSeek V4 PRO's latency) -> "xhigh" on Flash -> "high" -> "low" ->
    //    briefly omitted entirely -> back to "low". The omitted-entirely
    //    experiment coincided with a live course run showing more
    //    scene/header content-error retries than usual across several
    //    lessons (stray `export` in 2 headers, repeated "interpolate needs
    //    literal arrays" failures in one lesson) — not proven to be caused
    //    by the missing reasoning_effort specifically (no controlled A/B),
    //    but suspicious enough to revert to the last known value rather than
    //    keep guessing at an unconfirmed field. "low" was itself already a
    //    deliberate compromise: a live lesson run at "high" showed every one
    //    of 12 scenes taking 66-121s even on success (vs GLM's per-scene
    //    calls, which run with reasoning OFF entirely for exactly this
    //    reason — "fastest + cheapest") — "low" trades some of that latency
    //    win back for (hopefully) fewer content-error retries than the
    //    omitted-entirely experiment produced.
    //  - `reasoning_effort` is DeepSeek's OWN flat field (unlike OpenRouter's
    //    unified nested `reasoning: { effort }` shape used for GLM/Fable
    //    above) — this now goes straight to DeepSeek's API, so it needs
    //    DeepSeek's native param name.
    //  - No `provider` routing field: that was purely an OpenRouter concept
    //    (picking which upstream backend serves the model). Talking to
    //    DeepSeek's API directly means every request is already served by
    //    DeepSeek, so there's no routing choice left to make.
    extraParams: {
      reasoning_effort: "low",
      temperature: 0.9,
      top_p: 0.95,
    },
    maxTokens: 100000,
    keyEnv: "DEEPSEEK_API_KEY",
  },
  fable: {
    client: openRouterClient,
    model: "anthropic/claude-fable-5",
    // Fable 5's max output is far lower than GLM's, so cap max_tokens or the
    // request errors. 32k is plenty for an ad composition. MUCH pricier than
    // GLM/DeepSeek (~$15/$75 per M tokens vs cents) — used deliberately for
    // ads (low volume, one per user action), not the 6-lessons-per-course
    // code path.
    extraParams: { temperature: 1.0 },
    maxTokens: 32000,
    keyEnv: "OPENROUTER_API_KEY",
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

// Reasoning OFF, matching LESSON_CODE_PROVIDER — was tested at "xhigh"
// effort (OpenRouter's vocabulary; GLM-5.2's chat template maps it onto its
// native "max" reasoning tier) for this lesson-WIDE header call, one per
// lesson rather than one per scene. Didn't pay off enough to justify the
// extra latency/cost, so disabled like every other GLM call. Kept as its own
// const (rather than just reusing LESSON_CODE_PROVIDER directly) so the
// header call can still be given a different setting from per-scene code
// generation later without having to re-wire its call site again.
const HEADER_PROVIDER = (() => {
  const { reasoning: _reasoning, reasoning_effort: _reasoningEffort, ...rest } = LESSON_CODE_PROVIDER.extraParams;
  return {
    ...LESSON_CODE_PROVIDER,
    extraParams:
      LESSON_CODE_PROVIDER.client === deepseekClient
        // DeepSeek's native API has no confirmed "reasoning off" sentinel for
        // its flat `reasoning_effort` field (unlike OpenRouter's unified
        // nested `reasoning: { enabled: false }`, which is what this override
        // used before DeepSeek moved off OpenRouter) — omit the key entirely
        // rather than guess a value that might error or might not actually
        // disable reasoning. Verify against DeepSeek's own docs if this ever
        // needs to be exact.
        ? rest
        : { ...rest, reasoning: { enabled: false } },
  };
})();

// Scene-plan generation (the lesson-wide breakdown into 8-14 scenes — see
// sceneService.js's generateScenePlan) runs on GPT-5.6 Luna instead of
// GLM/whatever LESSON_CODE_MODEL selects — a deliberate, separate model
// choice from LESSON_CODE_PROVIDER/HEADER_PROVIDER's own selection, not
// something the LESSON_CODE_MODEL env var affects. History: DeepSeek V4
// Flash -> swapped to GPT-5.6 Luna (OpenRouter) for speed/quality -> back to
// DeepSeek V4 Flash, this time on DeepSeek's own native API directly instead
// of OpenRouter (same migration CODE_PROVIDERS.deepseek and ttsService.js
// already went through this session) — avoids this call sharing OpenRouter's
// account balance/credit limits with GLM/Fable, and this call in particular
// was hitting exactly that ("This request requires more credits...") even
// after the lesson-CODE path had already moved to DeepSeek directly.
const SCENE_PLAN_PROVIDER = {
  client: deepseekClient,
  model: "deepseek-v4-flash",
  // reasoning effort "low" — matches CODE_PROVIDERS.deepseek's own current
  // setting for the lesson CODE path. This is a fixed-shape JSON task (6
  // lessons, 20 questions), not code, and reasoning tokens draw from the
  // SAME max_tokens budget as the JSON output itself, so a lighter effort
  // tier leaves more of that budget for the actual JSON — but "low" (rather
  // than omitting the key entirely) keeps a little reasoning budget for
  // getting the lesson breakdown/sequencing right, which matters more for
  // course-level structure than it does for pure narration-JSON word counts.
  // No `provider` routing field — that was purely an OpenRouter concept
  // (picking which upstream backend serves a model); talking to DeepSeek's
  // API directly means every request is already served by DeepSeek, so
  // there's no routing choice left to make.
  extraParams: { reasoning_effort: "low" },
  maxTokens: 40000,
  keyEnv: "DEEPSEEK_API_KEY",
};

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
//
// Two SEPARATE limiters for lesson code-gen, not one shared pool. A lesson's
// scene calls are already gated behind its own header call resolving (see
// generateLessonCode below), so there's no in-lesson starvation risk from
// that ordering alone — but a shared pool would still let one lesson's 8-14
// scene calls starve a DIFFERENT lesson's (short, cheap) header call from
// even starting whenever more than one header/scene-plan/course-plan-style
// call happens to be in flight at once (header generation, scene-plan
// generation, and course-plan generation all share this same header pool —
// see HEADER_PROVIDER/SCENE_PLAN_PROVIDER). A small dedicated header limiter
// guarantees the cheap calls never queue for ages behind the expensive ones.
// (Lessons themselves build one at a time now — see courseController's
// buildLessonsSequentially — so this is no longer about cross-lesson
// contention specifically, just keeping the cheap/expensive call types from
// blocking each other.)
const GLM_HEADER_MAX_CONCURRENT = Number(process.env.GLM_HEADER_MAX_CONCURRENT) || 4;
const limitLessonHeaderCall = createLimiter(GLM_HEADER_MAX_CONCURRENT);

// Falls back to the old GLM_MAX_CONCURRENT env var if set (back-compat with
// any deploy that already tuned it), else a default of 6. One lesson alone
// can want 8-14 concurrent scene calls, and since courseController now
// builds lessons ONE AT A TIME (buildLessonsSequentially), this pool is no
// longer split across sibling lessons — a single lesson's scenes get the
// whole thing to themselves.
//
// History: 12 -> 8 -> 3 -> 2 -> 6. The drop to 2 turned out to cost far more
// than intended: with only 2 scenes able to run at once, a 12-scene lesson
// needs ~6 sequential waves to get through all of them, each wave gated by
// whichever of its 2 scenes is slower — this alone produced a near-perfect
// staircase of completion times (27s, 41s, 73s, 88s...331s) and pushed one
// real lesson's code stage to 332s. Our own concurrency testing never
// justified going that low: every batch size tested at n<=8 came back 100%
// clean, and failures only showed up starting around n=10-12. 6 sits
// comfortably under that measured-clean ceiling while recovering most of
// the lost parallelism — a middle ground between "maximum throughput" and
// "maximum margin against Z.ai's connection-error behavior under load."
const GLM_SCENE_MAX_CONCURRENT =
  Number(process.env.GLM_SCENE_MAX_CONCURRENT) || Number(process.env.GLM_MAX_CONCURRENT) || 6;
const limitLessonSceneCall = createLimiter(GLM_SCENE_MAX_CONCURRENT);

const AD_CODE_MAX_CONCURRENT = Number(process.env.AD_CODE_MAX_CONCURRENT) || 3;
const limitAdCodeCall = createLimiter(AD_CODE_MAX_CONCURRENT);

// Pull the useful bits out of a connection-level failure. The OpenAI SDK
// collapses network errors into a generic "Connection error." and stashes the
// real cause on err.cause — but that cause is usually just Node's own generic
// "TypeError: fetch failed", which ITSELF wraps the actual reason (ECONNRESET,
// ETIMEDOUT, ENOTFOUND, undici's own UND_ERR_CONNECT_TIMEOUT, etc.) one level
// deeper on its own .cause. Walk the whole chain instead of stopping at that
// first, uninformative "TypeError — fetch failed" level, so logs show WHY the
// connection actually failed, not just that it did.
function describeError(err) {
  const parts = [err.message];
  let current = err?.cause;
  let depth = 0;
  const MAX_CAUSE_DEPTH = 5; // defensive cap — real chains are 1-3 deep, this just guards against a pathological/cyclic one

  while (current && depth < MAX_CAUSE_DEPTH) {
    if (Array.isArray(current.errors)) {
      // AggregateError (e.g. undici trying multiple addresses/protocols at
      // once) — summarize each sub-error rather than just "AggregateError".
      const sub = current.errors.map((e) => e?.code || e?.message || String(e)).join("; ");
      parts.push(`${current.name || "AggregateError"} — ${sub}`);
      break; // sub-errors don't reliably chain further; we already have the detail
    }
    const code = current.code || current.errno || current.name;
    const msg = current.message || String(current);
    parts.push(code ? `${code} — ${msg}` : msg);
    current = current.cause;
    depth++;
  }

  if (parts.length === 1) return parts[0];
  return `${parts[0]} [cause: ${parts.slice(1).join(" → ")}]`;
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

  // Course plan generation runs on SCENE_PLAN_PROVIDER (DeepSeek V4 Flash,
  // native API) — same reasoning as sceneService.js's scene-plan call: a
  // bounded, fixed-shape JSON task (6 lessons, 20 questions), not code, so it
  // doesn't need to share whatever model LESSON_CODE_MODEL selects for the
  // actual animation code. SCENE_PLAN_PROVIDER's own extraParams already
  // omits any reasoning-effort key entirely (see its own comment — no
  // confirmed "off" sentinel for DeepSeek's native field), so there's
  // nothing left to strip/force here the way the old OpenRouter-routed setup
  // needed — this used to hardcode OpenRouter's unified `reasoning: {
  // enabled: false }` shape regardless of provider, which is meaningless
  // (and would've been silently ignored) now that this talks to DeepSeek's
  // API directly.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await SCENE_PLAN_PROVIDER.client.chat.completions.create({
        model: SCENE_PLAN_PROVIDER.model,
        ...SCENE_PLAN_PROVIDER.extraParams,
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
        // Include a snippet of the RAW response — without this, every future
        // occurrence just shows "got none" with no way to tell whether the
        // model wrapped the plan in an extra envelope key, returned prose
        // instead of JSON, or something else entirely. Attached directly to
        // the thrown error so it rides along with the existing "[plan]
        // Attempt X/Y failed" log line for free, no extra plumbing needed.
        throw contentError(
          `Course plan failed shape validation: ${errors.join("; ")}. Raw response (first 500 chars): ${text.slice(0, 500)}`
        );
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
      const response = await openRouterClient.chat.completions.create({
        model: "z-ai/glm-5.2",
        reasoning: { enabled: false },
        // Prefer Z.ai's own backend, fall back to another provider if it's
        // unavailable — see CODE_PROVIDERS.glm's comment for the full
        // reasoning (avoids OpenRouter's default price-ordered routing
        // silently picking a quantized third-party backend, while not
        // failing outright if Z.ai specifically can't serve this request).
        provider: { order: ["z-ai"], allow_fallbacks: true },
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
        throw new Error(`Remedial lesson plan generation failed with a non-retryable error (check OPENROUTER_API_KEY): ${describeError(err)}`);
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
      const response = await openRouterClient.chat.completions.create({
        model: "z-ai/glm-5.2",
        reasoning: { enabled: false },
        // Prefer Z.ai's own backend, fall back to another provider if it's
        // unavailable — see CODE_PROVIDERS.glm's comment for the full
        // reasoning (avoids OpenRouter's default price-ordered routing
        // silently picking a quantized third-party backend, while not
        // failing outright if Z.ai specifically can't serve this request).
        provider: { order: ["z-ai"], allow_fallbacks: true },
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
        throw new Error(`Next-course suggestions generation failed with a non-retryable error (check OPENROUTER_API_KEY): ${describeError(err)}`);
      }
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(
    `Failed to generate next-course suggestions after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LESSON CODE-GEN PROMPTS — split-call generation
// ═══════════════════════════════════════════════════════════════════════════
// Historically one call generated an entire lesson (imports + shared helpers +
// ALL scene components + the <Series> wrapper) in one ~50KB completion — any
// single syntax slip anywhere invalidated the whole file and forced a full
// from-scratch regeneration. This is now split into:
//   1. ONE header call (HEADER_CODE_GEN_RULES) — imports, palette/motif,
//      shared helper components. Decides the lesson's VISUAL IDENTITY once.
//   2. N parallel per-scene calls (SCENE_CODE_GEN_RULES) — each generates ONE
//      scene's function component, given the header code as context so it can
//      reference the same palette/helpers by name instead of reinventing them.
// A deterministic (non-LLM) stitcher (see stitchLessonCode below) then
// concatenates header + scene components + a <Series> wrapper built from
// scene metadata already known in code (durationInFrames, audioUrl) — never
// transcribed by the model. This shrinks a syntax error's blast radius from
// "whole lesson" to "one ~4KB scene," and lets scenes generate concurrently.
//
// Both prompts below fork from a single prior prompt (kept in git history);
// PERSONALIZED/COHERENT/FASTER design goals are preserved:
//   - PERSONALIZED: the worked examples are non-particle mechanisms (binary
//     search) framed as craft/safety references to copy PATTERNS from, never
//     a visual to reproduce.
//   - COHERENT: the header owns the lesson-wide VISUAL IDENTITY (one palette +
//     one recurring motif); every scene is handed that exact code and told to
//     reuse it, not invent its own.
//   - FASTER: each call is now small (one header, one scene) instead of an
//     entire lesson, so per-call latency and retry cost both drop sharply.
//
// Crash-safety rules (interpolate shape, clamp, spring fps, undefined guards,
// forbidden imports) are UNCHANGED in both forks — they are real runtime
// constraints of the browser sandbox, not compensations for model weakness.

const HEADER_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "i" (from "import"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer. You are building the SHARED FOUNDATION for an educational lesson — imports, a palette, a recurring motif, and reusable helper components — that every scene of this lesson will paste-reference by exact name. You do NOT write any scene's content, and you do NOT write the <Series> wrapper that plays the scenes — those come later, built by other code.

════════ PLAN BEFORE YOU CODE (do this in your head, do NOT write it as prose) ════════

LESSON VISUAL IDENTITY (decide ONCE, it must serve EVERY scene of this lesson):
Every scene in this lesson must feel like part of the SAME designed piece, not unrelated clips. Before any code, fix:
  • PALETTE: 3-4 colors derived from the SUBJECT, not a default. Biology→living greens; electronics→copper/PCB-green; finance→ink+ledger tones; astronomy→deep space + stellar accents; history→parchment/sepia. One background base, one primary accent (the "hero" color), one or two supporting hues. Declare these as named consts every scene will reuse.
  • MOTIF: one recurring visual element or geometry that threads through the lesson (a grid, a flowing current, orbital paths, a timeline spine, cells, layers). Build it as a reusable helper component so scenes can each evolve it, not copy-paste it.
  • TONE: match motion energy to the subject. A meditation lesson breathes slowly; a rocket-launch lesson is kinetic. Do not give every topic the same restless jitter.

════════ SANDBOX API (violate → build fails) ════════
1. Do NOT write "export" anywhere. This file is only imports + consts + helper function components — no exported component.
2. Import ONLY from "remotion" and "react".
   • From "remotion": any named export EXCEPT staticFile (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop).
   • From "react": ONLY useMemo, useCallback, useRef. useState DOES NOT EXIST here and crashes the video.
   • No other imports of any kind. This is the ONLY place imports are written for the whole lesson — scenes will not import anything themselves.
3. NO props, NO external/dynamic data on your top-level consts. Every identifier must be locally declared or a listed remotion/react export.
   • NEVER shadow a JS built-in (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set) with a variable/param/prop name.
   • NEVER declare a top-level name matching /^Scene\\d+$/ (e.g. Scene1, Scene2) or a name that looks like a lesson component name — those are reserved for scenes and the final export, generated separately.
4. Do NOT render <Series>, <Series.Sequence>, or <Audio> anywhere in this file — there is no scene content here to sequence, and no audio to attach. Those are assembled later from each scene's own file plus known scene metadata.
5. Any helper using useCurrentFrame() (e.g. an ambient backdrop) will have its frame counter reset to 0 every time the scene that mounts it starts — design its motion (e.g. Math.sin(frame/k)) so it looks right from frame 0, don't assume accumulation across the whole lesson.

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
    Also define ONCE the shared vertical ZONES every scene will place its content in — this is what keeps every scene's text and diagram out of each other's way, and keeps titles/captions landing in the SAME place across the whole lesson:
      const ZONES = {
        title:   { yMin: 120, yMax: 220 },
        diagram: { yMin: 260, yMax: 820 },
        caption: { yMin: 860, yMax: 980 },
      };
    • Oscillating: compute base ± amp*sin, THEN clamp — never assume it "stays in range".
    • Orbiting: radius ≤ min(centerX-SAFE.xMin, SAFE.xMax-centerX, centerY-SAFE.yMin, SAFE.yMax-centerY). For center (960,540), radius ≤ 420 is always safe.
    • Text: also leave ≥80px margin inside SAFE, since text has width/height beyond its anchor.
    • When generating random positions, generate INSIDE SAFE from the start — SAFE.xMin + Math.random()*(SAFE.xMax-SAFE.xMin) — not Math.random()*1920 then clamp (that piles everything onto the boundary).
    • Remotion's random(seed) returns the NUMBER itself, every time you call it — it is NOT a generator you call once to get a function back. Writing const rng = random(seed) and then calling rng() crashes with "rng is not a function". If you need several seeded values, call random() again with a different seed string each time: random(seed + "-a"), random(seed + "-b").

════════ SYNTAX TRAPS (silent break or parse error) ════════
Y1. JSX style objects and SVG attributes are camelCase, never kebab: backgroundColor, fontSize, borderRadius, boxShadow, textShadow, zIndex, justifyContent (not background-color…); strokeWidth, strokeLinecap, strokeDasharray, textAnchor, fillOpacity, clipPath (not stroke-width…). Kebab keys are silently ignored or a syntax error.
Y2. JSX attribute names differ from HTML: class → className, for → htmlFor.
Y3. Prefer string concatenation ("a" + b + "c") over template literals for dynamic colors/transforms/paths — zero risk of an unbalanced backtick. If you do use a template literal, every backtick must be paired (total count even); one stray backtick corrupts the whole rest of the file.
Y4. Never put comma-separated expressions bare in JSX braces ({a, b} is invalid). Never write a literal { or } as JSX text ("f(x) = {x}" breaks parsing) — write braces as string expressions {"{"} or reword to avoid them.
Y5. Any wrapper component you nest content inside MUST accept and render {children} ({ children } — NO type annotation; "React" is NOT imported/available here, so "React.ReactNode" or any other "React.X" type crashes with "React is not defined" … then {children} in its body). A wrapper missing {children} silently drops everything inside it — the #1 cause of blank scenes. If unsure, put the background as a sibling <AbsoluteFill> BEHIND the content instead of wrapping it.

════════ HEADER CRAFT ════════
Your job is the FOUNDATION, not a scene. Concretely produce:
  • The palette + motif consts/components described above, named clearly (e.g. PALETTE, Backdrop, Motif) so scenes can reference them without guessing.
  • The ZONES const from S5 — every scene relies on these exact numbers to avoid stacking text on text or letting a diagram creep into the text bands.
  • Any other TRULY shared utility worth extracting once (e.g. a Label component, a Panel/frame component) — only if more than one scene would plausibly need it. Do not invent scene-specific content; you have not been told what any individual scene shows.
  • Never leave a "TODO" or placeholder — every const/component you declare must be complete, working code a scene could use immediately.

════════ CODE QUALITY ════════
- Inline styles only (no Tailwind, no className for styling, no external CSS). No registerRoot, no Composition, no export.
- Every helper you declare should be genuinely reusable across scenes — this is the entire point of this file existing separately from scene code.

════════ WORKED EXAMPLE — COPY THE PATTERNS, NOT THE PICTURE ════════
This example shows the SAFE PATTERNS (clamp usage, a motif component) and the shape of what this file should contain — imports, constants, and 1-2 reusable helpers. It is deliberately minimal; your own palette/motif must come from YOUR lesson's subject, not this example's colors.

\`\`\`tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 160, xMax: 1760, yMin: 140, yMax: 940 };
const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ZONES = {
  title:   { yMin: 120, yMax: 220 },
  diagram: { yMin: 260, yMax: 820 },
  caption: { yMin: 860, yMax: 980 },
};

// LESSON MOTIF: a soft moving gradient wash in the lesson palette, reused as
// the base layer of every scene so the course reads as one piece. Mood motion
// only — it supports atmosphere, it is not the "content".
function Backdrop({ from = "#0b1f3a", to = "#05060f" }: { from?: string; to?: string }) {
  const frame = useCurrentFrame();
  const shift = 45 + Math.sin(frame / 60) * 10; // slow, calm — matches a calm subject's tone
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% " + shift + "%, " + from + ", " + to + " 70%)" }} />
  );
}
\`\`\`

════════ FINAL PASS (verify silently, fix before returning) ════════
• No export, no <Series>/<Series.Sequence>/<Audio> anywhere in this file.
• No useState / staticFile / non-remotion,react imports. No top-level name matching Scene1..N or a lesson-component-style name.
• Every interpolate: 3 args, literal number arrays, strictly-increasing inputRange. Every spring has fps. Every final position clamped to SAFE (S5).
• ZONES is declared with the three bands (title/diagram/caption) — every scene depends on these exact numbers existing.
• Every style key camelCase; no class=/for=; backtick count even; no bare braces in JSX text; every content-wrapper renders {children}.

Begin with imports, then CLAMP / FRAME / SAFE / clampPos / ZONES, then your palette consts, then your shared helper components. Your entire response is the code file, first characters "import", no text or fences around it.
`;

// ── DeepSeek-specific header prompt ──────────────────────────────────────────
// One short, XML-tagged reminder of the judgment call a smaller model is
// likeliest to let slide over a long prompt. Crash-safety rules are inherited
// verbatim via HEADER_CODE_GEN_RULES.
const DEEPSEEK_HEADER_COHERENCE_GATE = `<coherence_gate priority="critical">
Before writing anything, lock the lesson's VISUAL IDENTITY: one subject-derived palette (3-4 colors) + one recurring motif, as concrete named consts/components. Every scene of this lesson will use ONLY what you write here — under-deciding here (a generic default palette, a motif too thin to reuse) is the single biggest risk to the course looking coherent.
</coherence_gate>
`;

const DEEPSEEK_HEADER_CODE_GEN_RULES = DEEPSEEK_HEADER_COHERENCE_GATE + HEADER_CODE_GEN_RULES;

function selectHeaderSystemPrompt(provider) {
  return provider.model.startsWith("deepseek") ? DEEPSEEK_HEADER_CODE_GEN_RULES : HEADER_CODE_GEN_RULES;
}

// ═══════════════════════════════════════════════════════════════════════════
const SCENE_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "f" (from "function"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer. You build educational animations that a real studio would be proud of: purposeful, cinematic, and — above all — a clear visual explanation of ONE specific concept. Runs-without-crashing and stays-in-frame are the floor, not the goal. The goal is that a viewer who muted the audio would still understand the concept from the motion alone.

You are writing ONE SCENE of a larger lesson. The HEADER CODE below (already generated) has the lesson's imports, palette, and shared helper components already declared and in scope — reference those exact names; never redeclare, reimport, or rename them, and never invent a different palette.

════════ PLAN BEFORE YOU CODE (do this in your head, do NOT write it as prose) ════════

Work out four things for THIS scene, then build straight to them:
  (1) THE MECHANISM: what process does THIS scene teach, and what BEFORE→AFTER change must visibly happen across its duration (see CRAFT §A).
  (2) THE CAST: the specific elements the concept actually needs — sized to the concept, NOT to a quota. A clean idea shown with 4 well-chosen, well-animated elements beats 40 decorative ones. Add ambient/background motion only where it supports the mood; never as filler.
  (3) THE PACING: 3-5 staged reveals spread across the FULL duration, tracking the narration (see CRAFT §B).
  (4) THE LAYOUT: shared position anchors so connectors/labels/contents line up, every final position clamped to SAFE (see CRAFT §C, and SAFETY §5), and every element placed in its correct ZONES band so nothing overlaps (see CRAFT §D).

════════ SANDBOX API (violate → build fails) ════════
1. NO props, NO export. Write EXACTLY one top-level declaration: function SceneN() { ... } (using the exact name given to you), with no parameters. Any local helper you need must be a function NESTED inside this one — never a second top-level declaration.
2. Do NOT write ANY import statement. Everything you need — AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, the palette consts, the shared helper components — is already imported/declared by the header code below and in scope for you.
   • From "react": ONLY useMemo, useCallback, useRef exist. useState DOES NOT EXIST here and crashes the video.
3. NO external/dynamic data. Variables like user, session, props, context do not exist — referencing them crashes with "X is not defined". Every identifier must be locally declared (inside your function), a listed remotion/react export, or something declared in the header code below.
   • NEVER shadow a JS built-in (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set) with a variable/param name.
4. Do NOT render <Series>, <Series.Sequence>, or <Audio> — this scene is combined with the header and other scenes into those wrappers by other code after you return your function.
5. THIS SCENE'S DURATION is given to you as a literal number (durationInFrames). Hardcode that literal directly in your interpolate() calls for pacing (e.g. the last stage reveal near [durationInFrames - 30, durationInFrames] written as the actual number) — do not read it from a variable named durationInFrames, it does not exist in scope.
6. FRAME NUMBERS ARE PER-SCENE. useCurrentFrame() resets to 0 at the start of THIS scene — never offset a timing as if earlier scenes' durations apply here. Entrances live near [0, 30]; exits near [thisSceneDuration - 30, thisSceneDuration], written as literals of THIS scene's own duration.

════════ CRASH-SAFETY (each one is a real runtime crash — no exceptions) ════════
S1. interpolate(value, inputRange, outputRange, options?) — exactly 3 args + optional options object.
    • inputRange and outputRange are ARRAY LITERALS of plain number literals, written inline: [0, 20]. NEVER a variable holding an array, NEVER an expression inside the array (no [start, start+20], no [end-30, end], no [i*8]). If a value must vary, shift the FIRST argument instead: interpolate(frame - i * 8, [0, 20], [0, 1], CLAMP).
    • inputRange strictly increasing, no repeats. [0, 30, 60, 60] crashes — bump the dupe: [0, 30, 60, 61].
    • For hold-at-final: 2 points + CLAMP, e.g. interpolate(frame, [0, 30], [0, 1], CLAMP).
    • Use the header's CLAMP constant on entrance/exit interpolations so they don't overshoot. (Continuous Math.sin/cos motion needs no CLAMP.)
S2. spring() MUST receive both frame AND fps: spring({ frame, fps, config: {...} }) with const { fps } = useVideoConfig() inside your function. Missing fps throws.
S3. Never emit NaN into any SVG/style number (cx, cy, r, x, y, width, height, points, d, transforms):
    • Guard division: value / (denom || 1). Guard array access before use.
    • Math.sin/cos always get a plain finite number.
    • Filter polyline/polygon points: pts.filter(p => !isNaN(p.x) && !isNaN(p.y)).
S4. Never read a property off a possibly-undefined value ("Cannot read properties of undefined"):
    • Consecutive access: when a loop body reads arr[i+1] (connecting point i to i+1), iterate only to length-1 — arr.slice(0,-1).map((p,i)=>{ const next = arr[i+1]; ... }) — or guard: if (!next) return null;
    • Lookups that can miss (find(), map[key], arr[idx]): guard the result before reading .x/.y/.length.
S5. THE 1920x1080 FRAME IS A HARD BOUNDARY. Every final x/y/cx/cy/top/left/translate value MUST pass through the header's clampPos() to SAFE as its LAST step.
    • Oscillating: compute base ± amp*sin, THEN clamp — never assume it "stays in range".
    • Orbiting: radius ≤ min(centerX-SAFE.xMin, SAFE.xMax-centerX, centerY-SAFE.yMin, SAFE.yMax-centerY). For center (960,540), radius ≤ 420 is always safe.
    • Text: also leave ≥80px margin inside SAFE, since text has width/height beyond its anchor.
    • When generating random positions, generate INSIDE SAFE from the start — SAFE.xMin + Math.random()*(SAFE.xMax-SAFE.xMin) — not Math.random()*1920 then clamp (that piles everything onto the boundary).
    • Remotion's random(seed) returns the NUMBER itself, every time you call it — it is NOT a generator you call once to get a function back. Writing const rng = random(seed) and then calling rng() crashes with "rng is not a function". If you need several seeded values, call random() again with a different seed string each time: random(seed + "-a"), random(seed + "-b").

════════ SYNTAX TRAPS (silent break or parse error) ════════
Y1. JSX style objects and SVG attributes are camelCase, never kebab: backgroundColor, fontSize, borderRadius, boxShadow, textShadow, zIndex, justifyContent (not background-color…); strokeWidth, strokeLinecap, strokeDasharray, textAnchor, fillOpacity, clipPath (not stroke-width…). Kebab keys are silently ignored or a syntax error.
Y2. JSX attribute names differ from HTML: class → className, for → htmlFor.
Y3. Prefer string concatenation ("a" + b + "c") over template literals for dynamic colors/transforms/paths — zero risk of an unbalanced backtick. If you do use a template literal, every backtick must be paired (total count even); one stray backtick corrupts the whole rest of the file.
Y4. Never put comma-separated expressions bare in JSX braces ({a, b} is invalid). Never write a literal { or } as JSX text ("f(x) = {x}" breaks parsing) — write braces as string expressions {"{"} or reword to avoid them.
Y5. Any wrapper component you nest content inside MUST accept and render {children} ({ children } — NO type annotation; "React" is NOT imported/available here, so "React.ReactNode" or any other "React.X" type crashes with "React is not defined" … then {children} in its body). A wrapper missing {children} silently drops everything inside it — the #1 cause of blank scenes. If unsure, put the background as a sibling <AbsoluteFill> BEHIND the content instead of wrapping it.

════════ ANIMATION CRAFT — this is where the product lives ════════

§A — ILLUSTRATE THE MECHANISM, NOT A LABELED PICTURE. The single most common failure is a static shape with a name on it instead of the actual process happening. Show the BEFORE state becoming the AFTER state across the scene:
   • DNA replication → base pairs actually SEPARATING one by one, new bases animating in to pair with each exposed strand — not two lines labeled 5'/3'.
   • Cell division → for each phase, the real structures move: chromosomes condense and line up, spindle fibers extend, the membrane pinches — not a wheel with phase names spinning.
   • Enzyme activity → the enzyme shape travels ALONG the substrate with a visible change at the contact point — not a static blob labeled "enzyme".
   • Sorting → elements actually swap into order; binary search → the search window actually narrows.
   Test: paused at start / middle / end, does the frame look MEANINGFULLY different, reflecting real progress? If it's the same picture with a title fading in, it FAILS — no amount of background decoration rescues it.
   BINDING SPEC: you are given this scene's visualDescription (implement the specific elements/actions it names — not a different visual you'd prefer) and onScreenText (render VERBATIM as the scene's primary text — never paraphrase or replace it).
   INFORMATION BUDGET IS A HARD CAP, NOT A STYLE PREFERENCE: at most 2-3 small supporting labels visible on the diagram at any SINGLE frame, on top of the title/caption. Never label every element at once (e.g. a value AND a state AND a coordinate on each of 6 nodes = 18 competing text items is a FAIL, even if none of them technically overlap) — pick only what matters for THIS instant, and stage the rest in with the pacing (§B) instead of dumping every fact up front. A crowded frame confuses the viewer just as much as an overlapping one; when in doubt, cut a label — the motion carries the meaning, text only confirms the one or two things that matter right now.

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
   • Proportion: the main diagram dominates (~40-60% of frame width) in ZONES.diagram; labels are subordinate to what they label; contained items are a small fraction of their container; clamp any animated size to a sane range (a radius formula that can hit 0 or 900 is a bug).
   • NO SHAPE-ON-SHAPE OVERLAP IS A MECHANICAL CHECK, NOT A JUDGMENT CALL: list your major elements' (x, y, radius-or-half-width) at 3 checkpoints — scene start, the mid-pacing stage from §B, and the end. For each pair of elements simultaneously visible (opacity > 0) at a checkpoint, their centers must be farther apart than the sum of their radii/half-widths, i.e. no two bounding boxes intersect. If two elements are close, either increase the gap between their anchor coordinates or stagger their entrances (§B) so they're never both fully opaque at the same frame.

§D — READABLE TEXT LAYER. Use the header's ZONES for every text block: titles live in ZONES.title, captions in ZONES.caption (e.g. position with top: ZONES.title.yMin or top: ZONES.caption.yMin), and keep the diagram — including its full motion range, clamped per S5 — entirely inside ZONES.diagram; never let a clamped diagram position cross into ZONES.title or ZONES.caption. Give text a zIndex above the diagram plus a textShadow (or subtle dark backing) for contrast over any color. Body ≥28px, titles ≥36px.
   NON-OVERLAP IS MECHANICAL, NOT A JUDGMENT CALL: if two text blocks occupy the SAME zone one after another (e.g. two captions), the second block's fade-in START frame must be a LITERAL number that is ≥ the first block's fade-out END frame — compute both as adjacent literals together, e.g. first caption fades out over [140, 170], second caption fades in starting at exactly 170 (not 150, not "whenever it looks right"). Never write two interpolate() calls for the same zone whose opacity ranges can both be > 0 at the same frame.
   TOTAL READABLE-TEXT CAP: count every simultaneously-visible text item across ALL zones at any single frame — title + caption + diagram labels combined. Keep that count to roughly 4-5 at most. A frame that's technically non-overlapping but crammed with 10 small labels still reads as cluttered and confusing — the same INFORMATION BUDGET from §A applies to the whole frame, not just the diagram.

════════ CODE QUALITY ════════
- Inline styles only (no Tailwind, no className for styling, no external CSS). No registerRoot, no Composition, no export, no import.
- Reuse the header's palette/motif/helpers by name — never redeclare a name the header already declares.
- Any local helper you need must be NESTED inside your one top-level function — never a second top-level declaration (it would collide with another scene's code when combined).
- Scene length follows the concept: as long as it needs to illustrate the mechanism well, no longer. Don't pad to hit a line count.

════════ WORKED EXAMPLE — COPY THE PATTERNS, NOT THE PICTURE ════════
This example exists to show you the SAFE PATTERNS (clamp usage, staggered interpolate, spring+fps, shared-anchor coherence, staged reveals, mechanism illustration, nesting a local helper INSIDE the scene function) and the density of CRAFT expected. It is deliberately NOT particles-and-glowing-orbs. Your scene's actual visual must be invented from YOUR concept and the header's palette — do NOT reproduce this array/search look unless your topic genuinely is search. Also note: CLAMP, SAFE, clampPos, and Backdrop are NOT redeclared here — they come from the header, exactly like yours will. Study HOW it's built; then build something else.

\`\`\`tsx
// (CLAMP, SAFE, clampPos, Backdrop already exist — from the header, not redeclared here)

// The scene. The search window (lo..hi) NARROWS across the duration in staged
// steps — before → after progress the viewer can read without the audio.
function BinarySearchScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Local helper NESTED inside the scene function — never a second top-level
  // declaration, so it can never collide with another scene's own helpers.
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

      {/* Title in ZONES.title — the diagram's rowY=520 sits inside ZONES.diagram (260-820), never crossing into this band (§D) */}
      <div style={{ position: "absolute", left: 0, right: 0, top: ZONES.title.yMin, textAlign: "center", zIndex: 5 }}>
        <div style={{ color: "#eaf0ff", fontSize: 46, fontWeight: 800, opacity: titleOpacity, textShadow: "0 2px 20px rgba(0,0,0,0.9)" }}>Binary search halves the problem each step</div>
      </div>
      {/* Caption in ZONES.caption — a DIFFERENT zone from the title above, so the two can never overlap even if both were visible at once (§D) */}
      <div style={{ position: "absolute", left: 0, right: 0, top: ZONES.caption.yMin, textAlign: "center", zIndex: 5 }}>
        <div style={{ color: "#22d3a0", fontSize: 34, fontWeight: 700, opacity: foundOpacity, textShadow: "0 2px 16px rgba(0,0,0,0.9)" }}>Found 70 in 4 steps</div>
      </div>
    </AbsoluteFill>
  );
}
\`\`\`

Notice: the window NARROWS across the whole duration (staged progress, §B), the pointer reads the SAME geometry as the cells so it always lands on one (§C), highlight state is DRIVEN by the algorithm so the motion literally teaches it (§A), every position is clamped (S5), the title and caption sit in two DIFFERENT ZONES so they can never overlap each other or the diagram (§D), the interpolate ranges are literals (S1), spring gets fps (S2), the index lookup is guarded (S4), and Cell is nested INSIDE BinarySearchScene rather than a second top-level declaration. Reproduce these HABITS on a totally different visual built from your own concept and the header's palette.

════════ FINAL PASS (verify silently, fix before returning) ════════
• EXACTLY one top-level declaration (your scene function, correctly named), no import, no export, no <Series>/<Series.Sequence>/<Audio>.
• No useState / staticFile / non-remotion,react imports (there should be NO imports at all).
• Every interpolate: 3 args, literal number arrays, strictly-increasing inputRange. Every spring has fps. Every final position clamped to SAFE (S5). Every arr[i+1]/find()/lookup guarded (S4).
• Every style key camelCase; no class=/for=; backtick count even; no bare braces in JSX text; every content-wrapper renders {children}.
• Motion on every frame but motivated (§B); the mechanism visibly progresses start→end (§A); related elements share one anchor (§C).
• RAN THE §C OVERLAP CHECK at start/mid/end: no two simultaneously-visible elements' bounding boxes intersect.
• Every text block sits in its ZONES band (title/diagram/caption never cross into each other, §D); onScreenText rendered verbatim, legible; any two text blocks sharing a zone have adjacent, non-overlapping fade frames, never both opacity > 0 at once.
• COUNT your simultaneously-visible text items at the busiest frame (title + caption + diagram labels) — if it's above ~4-5, cut labels or stage them across the timeline instead (§A, §D). A crowded frame is a FAIL even with zero overlap.
• Uses the header's palette/motif/ZONES — does not invent new ones.

Your entire response is the scene's code, first characters "function", no text or fences around it.
`;

// ── DeepSeek-specific scene prompt ───────────────────────────────────────────
const DEEPSEEK_SCENE_COHERENCE_GATE = `<coherence_gate priority="critical">
Use the HEADER CODE's palette/motif exactly as given — do not invent new colors. For THIS scene, decide the MECHANISM (before→after) and a cast of elements sized to that concept, not a fixed quota of decorative particles. Every moving thing must either illustrate the concept or set the mood. The failure to avoid is two different things at once: a static labeled picture with no real progress, OR a generic particle-field indistinguishable across unrelated topics. Aim for a scene that teaches the concept through its motion and clearly belongs to THIS lesson.
</coherence_gate>
`;

const DEEPSEEK_SCENE_CODE_GEN_RULES = DEEPSEEK_SCENE_COHERENCE_GATE + SCENE_CODE_GEN_RULES;

function selectSceneSystemPrompt(provider) {
  return provider.model.startsWith("deepseek") ? DEEPSEEK_SCENE_CODE_GEN_RULES : SCENE_CODE_GEN_RULES;
}

// ── Naming + user-content builders ──────────────────────────────────────────
// Single source of truth for scene component names — used by the scene
// prompt, the validator, and the stitcher, so they can never disagree.
function sceneComponentName(index) {
  return `Scene${index + 1}`;
}

function buildHeaderUserContent(lesson, scenes) {
  const sceneTable = scenes
    .map(
      (s, i) =>
        `Scene ${i + 1}: visualType: ${s.visualType}
   onScreenText: ${s.onScreenText}
   visualDescription: ${s.visualDescription}`
    )
    .join("\n\n");

  return `
LESSON: ${lesson.title}
${lesson.description ? "LESSON SUMMARY: " + lesson.description + "\n" : ""}TOTAL SCENES: ${scenes.length}

Derive ONE lesson-wide VISUAL IDENTITY (palette + motif) from "${lesson.title}" that will suit ALL ${scenes.length} scenes below. Do not write any scene's content — just the shared imports, palette/motif consts, and reusable helper components.

SCENES (context only, so your palette/motif choice suits all of them — do not build these):

${sceneTable}
`;
}

function buildSceneUserContent(lesson, scene, index, totalScenes, headerCode, componentName) {
  const sceneName = sceneComponentName(index);
  return `
LESSON: ${lesson.title} (component ${componentName})
SCENE ${index + 1} of ${totalScenes}
YOUR FUNCTION NAME (use exactly this): ${sceneName}
durationInFrames: ${scene.durationInFrames}
visualType: ${scene.visualType}
onScreenText: ${scene.onScreenText}
visualDescription: ${scene.visualDescription}

HEADER CODE (already imported/declared — reference these exact names, do not redeclare or reimport):
\`\`\`tsx
${headerCode}
\`\`\`

Write ONLY the function ${sceneName}, illustrating this scene's mechanism per the PLAN and CRAFT sections above. No import, no export, no <Series>/<Series.Sequence>/<Audio>.
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

// Strip markdown fences only at the very start/end (a global strip could eat
// backticks inside the code's own template literals). Shared by the header
// and scene calls (and mirrors what the ad-code path does inline).
function stripCodeFences(text) {
  return text
    .trim()
    .replace(/^```(?:tsx|typescript|ts|jsx|js)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

// Streams one chat-completion request through a concurrency limiter, holding
// the slot for the ENTIRE request lifetime (open stream + consume every
// chunk) — releasing at create()-resolution would allow far more than N
// sockets at once. Shared by the header and scene calls below.
async function streamCodeCompletion({ limiter, provider, systemPrompt, userContent, maxOutputTokens }) {
  return limiter(async () => {
    const stream = await provider.client.chat.completions.create({
      model: provider.model,
      ...provider.extraParams,
      max_tokens: maxOutputTokens ?? provider.maxTokens ?? 100000,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
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
}

// Header's budget is much bigger than its ~16k of actual code needs because
// HEADER_PROVIDER now runs with reasoning ON ("xhigh" effort, GLM's native
// "max") — reasoning tokens draw from this SAME max_tokens budget, not a
// separate pool. OpenRouter's effort→budget formula caps reasoning at
// min(max_tokens * ratio, 32000) tokens regardless of "high" vs "xhigh"'s
// different ratios (both comfortably exceed the 32000 cap at this size), so
// at 60000 total: ~32000 goes to reasoning, leaving ~28000 for the actual
// header code — comfortably above the ~16000 it used when reasoning was off.
const HEADER_MAX_OUTPUT_TOKENS = 60000;
// Scene code generation now ALSO runs with reasoning ON ("high" effort, see
// CODE_PROVIDERS.glm) — same reasoning-eats-the-same-budget issue as the
// header above. At 72000 total, "high" reasoning caps at 32000, leaving
// ~40000 for the actual scene code — the same code budget scenes had before
// reasoning was turned on here, not a regression.
const SCENE_MAX_OUTPUT_TOKENS = 72000;

// Generates the shared header (imports, palette/motif, shared helper
// components) for a lesson — one small call, own retry loop, same
// content-feedback pattern as the rest of this file.
async function generateLessonHeader(lesson, scenes, maxAttempts = 2) {
  let lastError = null;
  let contentFeedback = null;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let receivedFullOutput = false;
    try {
      console.log(`  [header L${lesson.lessonNumber}] Attempt ${attempt}/${maxAttempts}...`);

      const userContent =
        buildHeaderUserContent(lesson, scenes) +
        (contentFeedback
          ? `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${contentFeedback}"\nRegenerate from scratch and make absolutely sure this specific problem does not occur again.`
          : "");

      const { text, stopReason } = await streamCodeCompletion({
        limiter: limitLessonHeaderCall,
        provider: HEADER_PROVIDER,
        systemPrompt: selectHeaderSystemPrompt(HEADER_PROVIDER),
        userContent,
        maxOutputTokens: HEADER_MAX_OUTPUT_TOKENS,
      });

      receivedFullOutput = true;
      if (stopReason === "length") {
        throw contentError("Header hit max_tokens — code was truncated. Generate more compact code.");
      }

      const code = stripCodeFences(text);
      if (!/^(import|const|function|\/\/|\/\*)/.test(code)) {
        throw contentError("Header output wasn't code — you MUST output only TSX code starting with `import`.");
      }

      const fixed = autoFixCode(code, {});
      const validated = validateHeaderFragment(fixed);

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  [header L${lesson.lessonNumber}] Valid header generated (${validated.length} chars) — took ${elapsedSec}s`);
      return validated;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Lesson header generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER.keyEnv}): ${describeError(err)}`);
      }
      if (err.isContentError || receivedFullOutput) contentFeedback = err.message;
      console.warn(`  [header L${lesson.lessonNumber}] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  const e = new Error(
    `Failed to generate a valid lesson header after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
  e.stage = "header";
  throw e;
}

// Generates ONE scene's function component, given the already-validated
// header code as context. Own retry loop, scoped to just this scene — a
// syntax slip in scene 7 only costs re-rolling scene 7, not the lesson.
async function generateSceneCode(lesson, scene, index, totalScenes, headerCode, headerAvailableNames, componentName, maxAttempts = 2) {
  const sceneName = sceneComponentName(index);
  let lastError = null;
  let contentFeedback = null;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let receivedFullOutput = false;
    try {
      const userContent =
        buildSceneUserContent(lesson, scene, index, totalScenes, headerCode, componentName) +
        (contentFeedback
          ? `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${contentFeedback}"\nRegenerate from scratch and make absolutely sure this specific problem does not occur again.`
          : "");

      const { text, stopReason } = await streamCodeCompletion({
        limiter: limitLessonSceneCall,
        provider: LESSON_CODE_PROVIDER,
        systemPrompt: selectSceneSystemPrompt(LESSON_CODE_PROVIDER),
        userContent,
        maxOutputTokens: SCENE_MAX_OUTPUT_TOKENS,
      });

      receivedFullOutput = true;
      if (stopReason === "length") {
        throw contentError(`Scene ${index + 1} hit max_tokens — code was truncated. Generate more compact code.`);
      }

      const code = stripCodeFences(text);
      if (!/^(function|const)\s/.test(code)) {
        throw contentError(`Scene ${index + 1} output wasn't code — you MUST output only a \`function ${sceneName}\` declaration.`);
      }

      const fixed = autoFixCode(code, { totalFrames: scene.durationInFrames });
      const validated = validateSceneFragment(fixed, sceneName, { headerAvailableNames });

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  [scene ${index + 1} L${lesson.lessonNumber}] Valid code generated (${validated.length} chars) — took ${elapsedSec}s for ${sceneName}`);
      return validated;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Scene ${index + 1} code generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER.keyEnv}): ${describeError(err)}`);
      }
      if (err.isContentError || receivedFullOutput) contentFeedback = err.message;
      console.warn(`  [scene ${index + 1} L${lesson.lessonNumber}] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(
    `Scene ${index + 1} (${sceneName}) failed after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

// Deterministic, non-LLM assembly: header + every scene's function component
// + a <Series> wrapper built directly from known scene metadata
// (durationInFrames, audioUrl) — never transcribed by the model, so a
// duration-sum drift or a mistyped audio URL is structurally impossible for
// the lesson path (unlike the ad-generation path, which still has the model
// write these itself — see enforceCorrectAudioUrls / generateAdCode).
// `sceneIndices` (optional) gives each entry's REAL scene index, for when
// `scenes`/`sceneCodes` aren't the full lesson's arrays in original order —
// e.g. a single-scene preview stitch of just scene 3, where the LOCAL array
// index is always 0 but the scene component is actually named "Scene4"
// (sceneComponentName is 1-indexed). Defaults to the local index (0..N-1),
// which is exactly right when `scenes`/`sceneCodes` are the full, in-order
// lesson arrays — the normal, unchanged full-lesson stitch behavior.
function stitchLessonCode({ header, sceneCodes, scenes, componentName, sceneIndices }) {
  const sequences = scenes
    .map((s, i) => {
      const realIndex = sceneIndices ? sceneIndices[i] : i;
      const name = sceneComponentName(realIndex);
      return (
        `      <Series.Sequence durationInFrames={${s.durationInFrames}}>\n` +
        `        <Audio src={${JSON.stringify(s.audioUrl)}} />\n` +
        `        <${name} />\n` +
        `      </Series.Sequence>`
      );
    })
    .join("\n");

  return [
    header.trim(),
    "",
    sceneCodes.join("\n\n"),
    "",
    `export const ${componentName} = () => {`,
    `  return (`,
    `    <Series>`,
    sequences,
    `    </Series>`,
    `  );`,
    `};`,
    "",
  ].join("\n");
}

// `scenePlan` is the raw scene-plan array (from generateScenePlan — synchronous,
// no audio measurements, used only for the scene count and header regen on
// retries). `scenePromises[i]` is a Promise resolving to that scene's FULL
// measured version (scene-plan fields + durationInFrames/audioUrl from TTS) —
// each scene's code generation awaits ONLY its own promise, so scene 1's code
// can start the moment scene 1's own audio is ready, without waiting on scene
// 12's audio (previously, the caller awaited ALL scenes' audio to fully
// finish before calling this function at all). `totalFrames` is no longer a
// parameter — every scenePromise must already be resolved by the time
// stitching happens (every scene's code generation awaited its own promise
// to even start), so it's computed internally from the resolved scenes at
// that point instead.
async function generateLessonCode(
  lesson,
  componentName,
  scenePlan,
  scenePromises,
  maxAttempts = 3,
  { onSceneCodeReady = null, headerPromise = null } = {}
) {
  let lastError = null;
  const lessonStart = Date.now();

  // Every scene gets its OWN full retry budget (SCENE_MAX_ATTEMPTS_PER_LESSON
  // attempts), spent entirely inside ITS OWN generateSceneCode call, which
  // runs concurrently with every other scene from the start — no group
  // barrier, just the shared concurrency semaphore (see the scene-firing
  // loop below). A scene that keeps failing no longer throws away every
  // other scene's already-good work (that would force a full
  // header+all-scenes rebuild) — and it never waits on a sibling to finish
  // before it's allowed to retry, either.
  //
  // This replaced an earlier "rounds" design (retry only the still-failing
  // scenes, but only after the ENTIRE batch settles, up to
  // EXTRA_SCENE_RETRY_ROUNDS times) — confirmed live to add real, avoidable
  // serial delay: a scene that failed early still had to wait for the
  // SLOWEST scene in the batch to finish before its own retry could even
  // begin, then paid for that retry entirely on top, e.g. one run where
  // scene 12 finished at 133s and a stuck scene 4's retry then added another
  // 58s AFTER that — 191s of a 235s code stage from essentially two scenes,
  // serialized by the round barrier rather than overlapping. Giving each
  // scene its whole retry budget up front removes that barrier entirely: a
  // failing scene's 2nd/3rd/4th attempt runs at whatever moment IT is ready,
  // overlapping with however long its siblings take, not after them.
  const SCENE_MAX_ATTEMPTS_PER_LESSON = 6; // same total ceiling the old 3-round design allowed (2 attempts x 3 rounds), just no longer serialized

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  [code L${lesson.lessonNumber}] Outer attempt ${attempt}/${maxAttempts} for ${componentName} (header + ${scenePlan.length} scenes)...`);

      // On the very first attempt, reuse a header generation the caller
      // already kicked off (typically started concurrently with audio
      // generation, well before this function was even called) instead of
      // starting a fresh one now — header generation no longer sits fully
      // behind the entire audio pipeline on the critical path. Header
      // content only depends on scene descriptions (visualType/onScreenText/
      // visualDescription), never on measured audio durations, so the header
      // generated from the pre-audio scene plan is identical to one
      // generated after. Any retry (attempt > 1) always generates a fresh
      // header, exactly as before this change.
      const header = attempt === 1 && headerPromise
        ? await headerPromise
        : await generateLessonHeader(lesson, scenePlan);
      const headerAvailableNames = getHeaderExposedNames(header);

      const sceneCodes = new Array(scenePlan.length).fill(null);
      const sceneErrors = new Array(scenePlan.length).fill(null);

      // ONE batch, every scene fired at once — no group barrier. Real
      // concurrency is bounded entirely by limitLessonSceneCall (the
      // semaphore generateSceneCode's streamCodeCompletion call acquires
      // internally), which rolls: the instant one scene's slot frees up,
      // the next queued scene takes it, regardless of which of its siblings
      // are still running. This replaced a fixed-size-group design (fire N,
      // wait for ALL N to settle, then fire the next N) that added an
      // artificial stall on top of the semaphore's own cap — a group of N
      // can't finish faster than its OWN slowest member, so one straggler
      // held back every other scene queued behind that group, even ones
      // that could have started immediately once an earlier scene in the
      // SAME group finished. Firing everything up front and letting the
      // semaphore alone pace it is strictly faster at the same concurrency
      // ceiling: no waiting on stragglers that aren't actually blocking a
      // free slot.
      //
      // Each scene ALSO waits on its own scenePromises[i] before it can even
      // start (this is the audio/code pipelining) — a scene whose audio
      // isn't measured yet simply hasn't reached generateSceneCode yet, but
      // that wait doesn't consume a limitLessonSceneCall slot (the semaphore
      // only wraps the actual LLM call inside generateSceneCode/
      // streamCodeCompletion), so it doesn't block any sibling that's ready
      // sooner. If a scene's audio permanently failed, scenePromises[i]
      // rejects, which is caught by the .catch() below exactly like a code-
      // generation content error — see ttsService.js's generateSceneAudio,
      // which tags that rejection with `.stage = "audio"` so the failure
      // this function eventually throws is still correctly attributed.
      //
      // Each scene's notification is attached directly to ITS OWN promise
      // via .then() below — NOT deferred to a .forEach() over the awaited
      // Promise.allSettled results. That distinction matters: awaiting
      // everything first would mean every scene's notification waits for
      // the SLOWEST scene overall to finish (confirmed live — a scene
      // needing its own internal retry delayed an already-finished
      // sibling's notification by over a minute). Attaching .then() to
      // each promise individually fires the moment THAT scene resolves,
      // regardless of its siblings.
      await Promise.allSettled(
        scenePlan.map((_, i) =>
          scenePromises[i].then((measuredScene) =>
            generateSceneCode(lesson, measuredScene, i, scenePlan.length, header, headerAvailableNames, componentName, SCENE_MAX_ATTEMPTS_PER_LESSON).then((code) => {
              sceneCodes[i] = code;
              sceneErrors[i] = null;

              // Notify a caller as soon as THIS scene's code is ready — in
              // whatever order scenes actually resolve, not just scene 0.
              // Lets a caller show live per-scene progress (e.g. a thumbnail
              // filmstrip) well before the whole lesson finishes. Stitched
              // into a standalone, self-contained single-scene composition
              // (same technique as the final full-lesson stitch, just for
              // one scene, using its REAL index so the wrapper references
              // the right component name) so it's directly
              // compilable/renderable on its own. Never fatal: a
              // stitch/validate/notify failure here is logged and otherwise
              // ignored — it must never affect the real lesson's
              // generation, which already succeeded for this scene.
              if (onSceneCodeReady) {
                try {
                  const previewStitched = stitchLessonCode({
                    header,
                    sceneCodes: [code],
                    scenes: [measuredScene],
                    componentName,
                    sceneIndices: [i],
                  });
                  const validatedPreview = validateGeneratedCode(previewStitched, componentName, measuredScene.durationInFrames);
                  const maybePromise = onSceneCodeReady(i, validatedPreview);
                  if (maybePromise?.catch) {
                    maybePromise.catch((notifyErr) =>
                      console.warn(`  [code L${lesson.lessonNumber}] Scene ${i + 1} progress notification failed (non-fatal): ${describeError(notifyErr)}`)
                    );
                  }
                } catch (stitchErr) {
                  console.warn(`  [code L${lesson.lessonNumber}] Scene ${i + 1} progress stitch/validate failed (non-fatal): ${describeError(stitchErr)}`);
                }
              }

              return code;
            })
          ).catch((err) => {
            sceneErrors[i] = err;
            throw err;
          })
        )
      );

      const stillFailingIndices = scenePlan.map((_, i) => i).filter((i) => sceneCodes[i] === null);
      if (stillFailingIndices.length > 0) {
        const detail = stillFailingIndices
          .map((i) => `scene ${i + 1} (${sceneComponentName(i)}): ${describeError(sceneErrors[i])}`)
          .join(" | ");
        throw contentError(
          `${stillFailingIndices.length}/${scenePlan.length} scene(s) still failing after ${SCENE_MAX_ATTEMPTS_PER_LESSON} attempts each: ${detail}`
        );
      }

      // Every scenePromises[i] is guaranteed already resolved here — each
      // one had to resolve before its generateSceneCode call above could
      // even start, and we just confirmed every scene has code. Promise.all
      // is instant, not an extra wait.
      const measuredScenes = await Promise.all(scenePromises);
      const totalFrames = measuredScenes.reduce((sum, s) => sum + s.durationInFrames, 0);

      const stitched = stitchLessonCode({ header, sceneCodes, scenes: measuredScenes, componentName });

      // Unchanged — final-file validation stays identical to before the
      // header/scene split. The duration-sum check should always pass by
      // construction now (stitchLessonCode copies scenes[i].durationInFrames
      // verbatim), but this stays as defense-in-depth.
      const validatedCode = validateGeneratedCode(stitched, componentName, totalFrames);

      const review = await reviewGeneratedCode(validatedCode, lesson);
      if (!review.skipped && review.ok === false) {
        throw contentError(
          `Code critic flagged issues: ${review.issues?.join("; ") || "unspecified"}`
        );
      }

      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      console.log(
        `  [code L${lesson.lessonNumber}] Valid code generated (${validatedCode.length} chars) — took ${elapsedSec}s for ${componentName}`
      );
      return { code: validatedCode, totalFrames };
    } catch (err) {
      lastError = err;

      if (isNonRetryable(err)) {
        throw new Error(
          `Lesson code generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER.keyEnv}): ${describeError(err)}`
        );
      }

      console.warn(`  [code L${lesson.lessonNumber}] Outer attempt ${attempt} failed: ${describeError(err)}. Retrying (full header+scenes rebuild)...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
  const e = new Error(
    `Failed to generate valid lesson code after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${lastError ? describeError(lastError) : "unknown error"}`
  );
  e.stage = lastError?.stage || "code";
  throw e;
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
  // Exposed for standalone testing of the split lesson-codegen pipeline
  // (header + per-scene calls + deterministic stitching) without needing a
  // full course-generation run.
  generateLessonHeader,
  generateSceneCode,
  stitchLessonCode,
  sceneComponentName,
  // Exposed so other lesson-pipeline services (sceneService, codeCriticService)
  // can run their own JSON-generation calls on whichever model is actually
  // configured for lesson code (LESSON_CODE_MODEL=glm|deepseek|fable) instead
  // of a separately hardcoded model — one provider choice, one place to change it.
  LESSON_CODE_PROVIDER,
  // Used for this file's own header generation only — see the comment where
  // it's defined for why per-scene code generation deliberately does NOT use
  // this.
  HEADER_PROVIDER,
  // Used by sceneService.js's generateScenePlan — GPT-5.6 Luna, not
  // GLM/DeepSeek, see the comment where it's defined.
  SCENE_PLAN_PROVIDER,
  streamCodeCompletion,
  limitLessonHeaderCall,
  describeError,
  isNonRetryable,
  backoffDelay,
};
