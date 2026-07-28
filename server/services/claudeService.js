const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");
const pdfParse = require("pdf-parse");
const JSZip = require("jszip");
const { validateGeneratedCode, validateHeaderFragment, validateSceneFragment, getHeaderExposedNames, compactHeaderForPrompt } = require("./validateCode");
const { reviewGeneratedCode } = require("./codeCriticService");
const { createLimiter } = require("../utils/concurrencyLimiter");

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════
// OpenRouter — Fable 5 ONLY (ads). GLM used to route through here too, but
// every GLM call now goes straight to Z.ai's own API (zaiClient): separate
// account/balance, and no OpenRouter routing-to-quantized-backend risk.
const openRouterClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 300 * 1000, // hard ceiling; the stream idle-watchdog below fails much faster
  maxRetries: 0,       // retries are handled manually (withRetries)
});

// Z.ai direct — ALL GLM calls in this file (lesson header, per-scene code,
// scene-plan, course-plan, remedial plan, next-course suggestions). Same
// OpenAI-compatible chat-completions shape as OpenRouter; only the base
// URL/key and the reasoning-toggle syntax differ (Z.ai's NATIVE
// `thinking: { type: "disabled" | "enabled" }`, NOT OpenRouter's unified
// `reasoning: { enabled }` — Z.ai's own API does not understand the latter).
const zaiClient = new OpenAI({
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.z.ai/api/paas/v4",
  timeout: 300 * 1000,
  maxRetries: 0,
});

// Anthropic direct — Claude Sonnet 5 lesson/scene/ad code. NOT OpenRouter:
// this hits Anthropic's own Messages API, which is a different wire shape
// from the OpenAI-compatible chat-completions surface the two clients above
// use (content blocks + top-level `stop_reason`/`usage.input_tokens`, not
// `delta.content` + `finish_reason`/`usage.prompt_tokens`) — streamCodeCompletion
// branches on provider.isAnthropicNative to speak the right one.
const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 300 * 1000,
  maxRetries: 0,
});

// DeepSeek direct — course plan + per-lesson scene plan (see
// DEEPSEEK_COURSE_PLAN_PROVIDER / DEEPSEEK_SCENE_PLAN_PROVIDER below). Own
// account/balance, hit directly at api.deepseek.com — not OpenRouter. Same
// OpenAI-compatible chat-completions wire shape as zaiClient/openRouterClient,
// and DeepSeek's native reasoning toggle mirrors Z.ai/Anthropic's own
// `thinking: { type: "disabled" | "enabled" }` field (plus its own
// `reasoning_effort` knob — see DEEPSEEK_COURSE_PLAN_PROVIDER).
const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
  timeout: 300 * 1000,
  maxRetries: 0,
});
if (!process.env.DEEPSEEK_API_KEY) {
  console.warn("[codegen] WARNING: DEEPSEEK_API_KEY is not set — course-plan and scene-plan generation will fail with an auth error.");
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER TABLE
// ═══════════════════════════════════════════════════════════════════════════
// Reasoning is OFF everywhere on GLM by design: GLM's native `thinking` field
// has no token cap (unlike OpenRouter's old unified shape), so leaving it on
// meant unbounded invisible reasoning tokens — measured 200-870+ seconds per
// call at "high" effort, 987s+ for one lesson's code stage.
const CODE_PROVIDERS = {
  glm: {
    client: zaiClient,
    model: "glm-5.2",
    extraParams: { thinking: { type: "disabled" } },
    maxTokens: 100000,
    keyEnv: "ZAI_API_KEY",
  },
  fable: {
    client: openRouterClient,
    model: "anthropic/claude-fable-5",
    // Fable 5's max output is far lower than GLM's — 32k is plenty for an ad
    // composition and anything higher errors. MUCH pricier than GLM
    // (~$15/$75 per M tokens vs cents) — used deliberately for ads only
    // (low volume, one per user action), never the 6-lessons-per-course path.
    extraParams: { temperature: 1.0 },
    maxTokens: 32000,
    keyEnv: "OPENROUTER_API_KEY",
  },
  // Claude Sonnet 5, called directly against Anthropic's own API (not
  // OpenRouter, not Z.ai) via anthropicClient. No extraParams: Sonnet 5
  // rejects non-default temperature/top_p/top_k outright (400). maxTokens
  // is a fallback only — every call site below passes its own explicit
  // maxOutputTokens (HEADER/SCENE_MAX_OUTPUT_TOKENS), well under Sonnet 5's
  // 128k ceiling.
  claude: {
    client: anthropicClient,
    isAnthropicNative: true,
    model: "claude-sonnet-5",
    extraParams: {},
    maxTokens: 100000,
    keyEnv: "ANTHROPIC_API_KEY",
  },
};

function resolveProvider(envVar, defaultKey) {
  const requested = process.env[envVar];
  const provider = CODE_PROVIDERS[["fable", "glm", "claude"].includes(requested) ? requested : defaultKey];
  if (!process.env[provider.keyEnv]) {
    console.warn(`[codegen] WARNING: ${provider.keyEnv} is not set — ${envVar} generation will fail with an auth error.`);
  }
  return provider;
}

// Lesson code (6+ per course, high volume) → GLM 5.2: fast, cheap, concurrent.
// Ad code (one per user action, low volume) → Fable 5: stronger, pricier.
const LESSON_CODE_PROVIDER = resolveProvider("LESSON_CODE_MODEL", "glm");
const AD_CODE_PROVIDER = resolveProvider("AD_CODE_MODEL", "fable");

// Derives a reasoning-off variant of whichever provider LESSON_CODE_MODEL
// selects — both the header call and every per-scene call run with reasoning
// off (deterministic code generation gets nothing from a hidden
// chain-of-thought, and on GLM it would draw unbounded invisible tokens from
// the same output budget as the actual code — GLM's native `thinking` field
// has no token cap, unlike DeepSeek's bounded `reasoning_effort`, so this is
// a hard rule on GLM specifically, not just a preference).
//
// The reasoning-toggle FIELD differs by client, same distinction as the
// clients comment above: Z.ai's native API and Anthropic's own Messages API
// both take `thinking: {type}` (Z.ai mirrors Anthropic's wire shape).
// OpenRouter (fable) takes its own unified `reasoning: {enabled}` instead —
// sending the wrong shape is either ignored or a 400, not a no-op, so this
// can't be one hardcoded field for every provider.
function withReasoningOff(provider) {
  const { thinking: _t, reasoning_effort: _r, reasoning: _ro, ...rest } = provider.extraParams;
  const reasoningOffParam = provider.client === openRouterClient
    ? { reasoning: { enabled: false } }
    : { thinking: { type: "disabled" } };
  return { ...provider, extraParams: { ...rest, ...reasoningOffParam } };
}
const LESSON_HEADER_PROVIDER = withReasoningOff(LESSON_CODE_PROVIDER);
const LESSON_SCENE_PROVIDER = withReasoningOff(LESSON_CODE_PROVIDER);

// Remedial-lesson-plan / next-course-suggestions: bounded, fixed-shape JSON
// (not code) on GLM 5.2 via Z.ai directly — unchanged, lower-stakes calls not
// worth reasoning tokens. Course plan and per-lesson scene plan both run on
// DeepSeek V4 Flash instead (see DEEPSEEK_COURSE_PLAN_PROVIDER /
// DEEPSEEK_SCENE_PLAN_PROVIDER below), reasoning at HIGH effort — both set
// the structure everything downstream depends on (the whole course's shape;
// one lesson's scene breakdown, including each scene's mechanism), so the
// extra latency is worth it. DeepSeek's `reasoning_effort` only accepts
// "high"/"max" (low/medium are silently remapped up to "high" for
// compatibility), so "high" here is the true minimum, not a soft preference.
const SCENE_PLAN_PROVIDER = {
  client: zaiClient,
  model: "glm-5.2",
  extraParams: { thinking: { type: "disabled" } },
  maxTokens: 40000,
  keyEnv: "ZAI_API_KEY",
};

const DEEPSEEK_COURSE_PLAN_PROVIDER = {
  client: deepseekClient,
  model: "deepseek-v4-flash",
  extraParams: { thinking: { type: "enabled" }, reasoning_effort: "high" },
  // Reasoning tokens are drawn from this SAME budget, on top of the actual
  // JSON — the reasoning-off floor (a few thousand tokens) has no headroom
  // left once high-effort reasoning is turned on.
  maxTokens: 40000,
  keyEnv: "DEEPSEEK_API_KEY",
};
const DEEPSEEK_SCENE_PLAN_PROVIDER = {
  client: deepseekClient,
  model: "deepseek-v4-flash",
  extraParams: { thinking: { type: "enabled" }, reasoning_effort: "high" },
  // Same reasoning-budget note as DEEPSEEK_COURSE_PLAN_PROVIDER above.
  maxTokens: 40000,
  keyEnv: "DEEPSEEK_API_KEY",
};

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENCY
// ═══════════════════════════════════════════════════════════════════════════
// Z.ai enforces ONE account-wide concurrency cap across all models and
// endpoints. limitZaiCall (default 1) covers remedial-lesson-plan and
// next-course generation — low volume/short calls where the connection-drop
// risk under concurrency isn't worth the tiny time saved.
//
// Lesson code generation is split header + per-scene again (see
// generateLessonHeader/generateSceneCode below) — two pools:
//   limitLessonHeaderCall (default 6) — one header call per lesson. With
//     buildLessonsConcurrently building every lesson in a course at once,
//     up to lessonCount of these can be in flight together; 6 covers the
//     default course size with no queuing.
//   limitLessonSceneCall (default 100) — per-scene code, the call type with
//     real volume (8-15 scenes/lesson). With 6 lessons building concurrently
//     AND each scene starting the instant ITS OWN audio is ready (not
//     waiting on the rest of the lesson), a course can easily have 60-80+
//     scene calls wanting to run together — 100 gives that plenty of room
//     rather than forcing scenes to queue behind each other. GLM-5.2 is a
//     sparse MoE model (~40B active of far more total params per token),
//     whose serving infra (vLLM/SGLang) routes experts per-request rather
//     than one request blocking the whole model, so it handles this volume
//     of concurrent requests without the per-request slowdown a dense model
//     would show. Tune either down if connection-drop errors show up under
//     multi-user load.
const ZAI_MAX_CONCURRENT = Number(process.env.ZAI_MAX_CONCURRENT) || 1;
const limitZaiCall = createLimiter(ZAI_MAX_CONCURRENT);
const LESSON_HEADER_MAX_CONCURRENT = Number(process.env.LESSON_HEADER_MAX_CONCURRENT) || 6;
const limitLessonHeaderCall = createLimiter(LESSON_HEADER_MAX_CONCURRENT);
const LESSON_SCENE_MAX_CONCURRENT = Number(process.env.LESSON_SCENE_MAX_CONCURRENT) || 100;
const limitLessonSceneCall = createLimiter(LESSON_SCENE_MAX_CONCURRENT);
const AD_CODE_MAX_CONCURRENT = Number(process.env.AD_CODE_MAX_CONCURRENT) || 3;
const limitAdCodeCall = createLimiter(AD_CODE_MAX_CONCURRENT);
// DeepSeek's own documented account-wide cap for deepseek-v4-flash is 2,500
// concurrent requests (hard cap, HTTP 429 past it) — 100 is a comfortable
// ceiling far under that, not a stretch. Course plan and scene plan run on
// GLM again (see SCENE_PLAN_PROVIDER above); the only current caller of this
// limiter is the pre-course level assessment in levelAssessmentService.js
// (which imports it directly), so in practice this rarely sees more than a
// couple of concurrent calls — the headroom just means it never becomes a
// bottleneck if that changes.
const DEEPSEEK_MAX_CONCURRENT = Number(process.env.DEEPSEEK_MAX_CONCURRENT) || 100;
const limitDeepSeekCall = createLimiter(DEEPSEEK_MAX_CONCURRENT);

console.log(
  `[codegen] lesson code → ${LESSON_CODE_PROVIDER.model} (set LESSON_CODE_MODEL=fable | glm | claude to switch) | ` +
  `ad code → ${AD_CODE_PROVIDER.model} (set AD_CODE_MODEL=fable | glm | claude to switch)`
);

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CLASSIFICATION + RETRY ENGINE
// ═══════════════════════════════════════════════════════════════════════════
//   - Transport errors (connection reset, rate limit, 5xx, stalled stream):
//     retry as-is.
//   - Content errors (bad JSON, failed validation, critic rejection): the
//     model produced wrong OUTPUT; the message is fed back into the retry
//     prompt so the next attempt is corrective, not a blind reroll.
//   - Non-retryable (401/403 auth): fail immediately with the right env var.
function contentError(message) {
  const err = new Error(message);
  err.isContentError = true;
  return err;
}

function isNonRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 401 || status === 403;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backoffDelay(attempt, baseMs = 500, capMs = 8000) {
  const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  const jitter = Math.random() * exp * 0.3;
  await sleep(exp + jitter);
}

// Pull the useful bits out of a connection-level failure. The OpenAI SDK
// collapses network errors into a generic "Connection error." with the real
// cause chained on err.cause (often itself wrapping the actual ECONNRESET/
// ETIMEDOUT/UND_ERR_CONNECT_TIMEOUT one level deeper). Walk the whole chain
// so logs show WHY the connection failed, not just that it did.
function describeError(err) {
  const parts = [err.message];
  let current = err?.cause;
  let depth = 0;
  const MAX_CAUSE_DEPTH = 5; // real chains are 1-3 deep; guards a cyclic one

  while (current && depth < MAX_CAUSE_DEPTH) {
    if (Array.isArray(current.errors)) {
      const sub = current.errors.map((e) => e?.code || e?.message || String(e)).join("; ");
      parts.push(`${current.name || "AggregateError"} — ${sub}`);
      break;
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

// ONE retry loop for the whole file. Every generation path (course plan,
// remedial, suggestions, header, scene, ad) previously carried its own
// copy-pasted attempt loop with subtly different feedback/stage handling —
// this replaces all six with identical, tested semantics:
//   fn({ attempt, feedback }) — feedback is the previous attempt's content-
//   error message (null on attempt 1); fn appends it to its prompt so the
//   retry is corrective.
async function withRetries(label, maxAttempts, fn, { keyEnv, stage } = {}) {
  let lastError = null;
  let feedback = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn({ attempt, feedback });
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(
          `${label} failed with a non-retryable error${keyEnv ? ` (check ${keyEnv})` : ""}: ${describeError(err)}`
        );
      }
      if (err.isContentError) feedback = err.message;
      console.warn(`  [${label}] Attempt ${attempt}/${maxAttempts} failed: ${describeError(err)}. Retrying...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  const e = new Error(
    `${label} failed after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
  if (stage) e.stage = stage;
  if (lastError?.stage) e.stage = lastError.stage;
  throw e;
}

// The corrective-feedback suffix appended to a retry prompt. Shared verbatim
// by every path so the model always sees rejections in the same format.
function feedbackSuffix(feedback) {
  if (!feedback) return "";
  return `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${feedback}"\nRegenerate from scratch and make absolutely sure this specific problem does not occur again.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE JSON EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════
// Walks from a "{" tracking bracket depth and string state to the matching
// close brace — immune to stray braces inside string values or commentary.
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

  return null; // never closed
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

// ONE JSON-generation path for course plans, remedial plans, and next-course
// suggestions: Z.ai direct, shared limiter, truncation detection, safe parse,
// caller-supplied shape validation, and corrective feedback on retry (a
// shape-validation failure message rides into the next attempt's prompt
// exactly like code-gen does). `provider`/`limiter` are overridable (used
// briefly to route course-plan generation to DeepSeek — see
// DEEPSEEK_COURSE_PLAN_PROVIDER above) but every current call site uses the
// GLM/Z.ai defaults.
async function generateJson({ label, maxAttempts, maxTokens, buildMessages, validate, provider = SCENE_PLAN_PROVIDER, limiter = limitZaiCall }) {
  return withRetries(label, maxAttempts, async ({ feedback }) => {
    const response = await limiter(() =>
      provider.client.chat.completions.create({
        model: provider.model,
        ...provider.extraParams,
        max_tokens: maxTokens,
        messages: buildMessages(feedback),
      })
    );

    const choice = response.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw contentError(`${label} response hit max_tokens and was truncated — the JSON is incomplete`);
    }

    // Thinking-mode providers (DeepSeek, same convention as Z.ai/Anthropic)
    // return reasoning in a separate `message.reasoning_content` field, never
    // mixed into `message.content` — no extra stripping needed here.
    const text = choice?.message?.content || "";
    const parsed = safeParseJson(text);
    return validate(parsed, text);
  }, { keyEnv: provider.keyEnv });
}

// ═══════════════════════════════════════════════════════════════════════════
// COURSE PLAN
// ═══════════════════════════════════════════════════════════════════════════
function validateCoursePlan(plan, expectedLessonCount = 6, expectedMcqCount = 20) {
  const errors = [];

  if (!plan || typeof plan !== "object") {
    errors.push("Plan is not an object");
    return { ok: false, errors };
  }

  if (!Array.isArray(plan.lessons) || plan.lessons.length !== expectedLessonCount) {
    errors.push(`Expected ${expectedLessonCount} lessons, got ${plan.lessons?.length ?? "none"}`);
  } else {
    plan.lessons.forEach((lesson, i) => {
      if (!lesson.title || typeof lesson.title !== "string") {
        errors.push(`Lesson ${i + 1}: missing/invalid title`);
      }
      if (!lesson.description || typeof lesson.description !== "string") {
        errors.push(`Lesson ${i + 1}: missing/invalid description`);
      }
      if (!Array.isArray(lesson.keyPoints) || lesson.keyPoints.length !== 4) {
        errors.push(`Lesson ${i + 1}: expected 4 keyPoints, got ${lesson.keyPoints?.length ?? "none"}`);
      } else if (lesson.keyPoints.some((kp) => typeof kp !== "string" || !kp.trim())) {
        errors.push(`Lesson ${i + 1}: keyPoints must all be non-empty strings`);
      }
    });
  }

  if (!Array.isArray(plan.questions) || plan.questions.length !== expectedMcqCount) {
    errors.push(`Expected ${expectedMcqCount} questions, got ${plan.questions?.length ?? "none"}`);
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

// A .pptx is a ZIP of XML parts; slide text lives in ppt/slides/slideN.xml as
// <a:t>...</a:t> runs. Extracted text feeds the same plain-text course-plan
// prompt used for PDFs/pasted text.
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

async function generateCoursePlan(topic, pdfText, pdfBuffer, sourceFileName, level = null, maxAttempts = 3, lessonCount = 6, mcqCount = 20) {
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
- ${mcqCount} questions distributed across the ${lessonCount} lessons
- "correct" is the 0-based index
- Pure JSON only, no backticks${levelGuidance}
- CRITICAL: Respond with ONLY the JSON object. No commentary, no acknowledgment, no clarifying questions — even if the input is unusually long, looks like a document rather than a short topic, or seems ambiguous. If the input is long or document-like, identify its single most central subject and build the course plan around that. Never refuse and never ask a follow-up question — always produce the JSON.`;

  // DeepSeek is a text endpoint — it can't ingest raw document bytes. Extract
  // text first (PDF via pdf-parse, PPTX via extractPptxText), capped at
  // MAX_PDF_TEXT_CHARS, and feed the same plain-text path as pasted text.
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

  if (truncated) {
    console.warn(
      `  [plan] pdfText truncated from ${effectivePdfText.length} to ${MAX_PDF_TEXT_CHARS} chars — course plan may miss later sections.`
    );
  }

  const basePrompt = `
You are an expert educational content designer.

${context}

Generate a ${lessonCount}-lesson course plan and a ${mcqCount}-question assessment.

Return ONLY valid JSON, no markdown, exactly this structure:
${jsonSchema}
${rules}
`;

  const plan = await generateJson({
    label: `plan`,
    maxAttempts,
    provider: DEEPSEEK_COURSE_PLAN_PROVIDER,
    limiter: limitDeepSeekCall,
    // FIX: was a flat 8000, which a large tier (e.g. 10 lessons / 40 MCQs from
    // courseController's tier-priced path) could genuinely exceed — scale the
    // budget with the requested shape instead. Floor raised from 3000 to
    // 12000: with high-effort thinking ON, reasoning tokens draw from this
    // SAME max_tokens budget before the actual JSON is written, so the
    // reasoning-off floor left no room once thinking was turned on.
    maxTokens: Math.min(40000, 12000 + lessonCount * 500 + mcqCount * 200),
    buildMessages: (feedback) => [{ role: "user", content: basePrompt + feedbackSuffix(feedback) }],
    validate: (parsed, raw) => {
      const { ok, errors } = validateCoursePlan(parsed, lessonCount, mcqCount);
      if (!ok) {
        // Include a snippet of the RAW response so a failure log shows
        // whether the model wrapped the plan in an envelope key, returned
        // prose, etc. — not just "got none".
        throw contentError(
          `Course plan failed shape validation: ${errors.join("; ")}. Raw response (first 500 chars): ${raw.slice(0, 500)}`
        );
      }
      return parsed;
    },
  });

  if (truncated) plan.__truncatedInput = true;
  return plan;
}

// ── Remedial lesson plan (collaborative courses) ────────────────────────────
// {title, description, keyPoints} for ONE new lesson targeting the group's
// weakest topic; hands off to the existing buildLesson pipeline. Deliberately
// re-teaches from a different angle than a first pass would.
async function generateRemedialLessonPlan(courseTopic, weakTopic, groupAvgPct, maxAttempts = 3) {
  const basePrompt = `
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
`;

  return generateJson({
    label: "remedial",
    maxAttempts,
    maxTokens: 2000,
    buildMessages: (feedback) => [{ role: "user", content: basePrompt + feedbackSuffix(feedback) }],
    validate: (plan) => {
      if (
        !plan.title || typeof plan.title !== "string" ||
        !plan.description || typeof plan.description !== "string" ||
        !Array.isArray(plan.keyPoints) || plan.keyPoints.length !== 4
      ) {
        throw contentError("Remedial lesson plan failed shape validation");
      }
      return plan;
    },
  });
}

// ── Continuous learning: next-course suggestions ────────────────────────────
async function generateNextCourseSuggestions(completedTopic, weakTopics = [], maxAttempts = 2) {
  const weakContext = weakTopics.length
    ? `The learner's weaker areas from their quiz results were: ${weakTopics.join(", ")}.`
    : "";

  const basePrompt = `
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
`;

  const parsed = await generateJson({
    label: "next-course",
    maxAttempts,
    maxTokens: 1000,
    buildMessages: (feedback) => [{ role: "user", content: basePrompt + feedbackSuffix(feedback) }],
    validate: (p) => {
      if (!Array.isArray(p.suggestions) || p.suggestions.length !== 3) {
        throw contentError("Next-course suggestions failed shape validation");
      }
      return p;
    },
  });

  return parsed.suggestions;
}

// ═══════════════════════════════════════════════════════════════════════════
// LESSON CODE-GEN PROMPTS — split-call generation (header + per-scene)
// ═══════════════════════════════════════════════════════════════════════════
// Splits lesson code generation into one header call (visual identity —
// palette, motif, shared consts/helpers) + N parallel per-scene calls, so a
// lesson's 8-15 scenes can generate concurrently instead of one long serial
// stream. This is the SAME simple, example-driven prompt style that produced
// the single-call design's "top" quality (three mandatory layers, a handful
// of richness rules, one clear worked example, trust in the model's own
// judgment) — split across two calls, not reverted to an earlier split
// pipeline's exhaustive MECHANISM/FINGERPRINT/CAST/PACING/CONTAINMENT/
// COLLISION planning checklist. Both header and scene calls run on GLM 5.2
// (LESSON_CODE_MODEL), reasoning OFF for both — GLM's native `thinking`
// field has no token cap, so leaving it on for either call would draw
// unbounded invisible tokens from the same budget as the actual code. A
// deterministic stitcher (stitchLessonCode) assembles header + scenes + a
// <Series> wrapper from known metadata — the model never transcribes
// durations or audio URLs on this path.

const HEADER_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "i" (from "import"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer. You are building the SHARED FOUNDATION for an educational lesson — imports, a palette, a recurring motif, and reusable helper components — that every scene of this lesson will paste-reference by exact name. You do NOT write any scene's content, and you do NOT write the <Series> wrapper that plays the scenes — those come later, built by other code.

LESSON VISUAL IDENTITY — decide once, it must serve EVERY scene of this lesson:
Every scene in this lesson must feel like part of the SAME designed piece, not unrelated clips. Before any code, fix:
  • PALETTE: 3-4 colors derived from the SUBJECT, not a default. Biology→living greens; electronics→copper/PCB-green; finance→ink+ledger tones; astronomy→deep space + stellar accents; history→parchment/sepia; chemistry→lab-glass teals with reagent accents; economics→newsprint neutrals with one signal color. One background base, one primary accent (the "hero" color), one or two supporting hues — AND one dedicated TEXT color guaranteed high-contrast against the background base (near-white on dark bases, near-black on light bases). Declare ALL of these as named consts (a PALETTE object with a .text key) every scene will reuse — scenes must never have to guess what color makes text readable.
  • MOTIF: one recurring visual element or geometry that threads through the lesson (a grid, a flowing current, orbital paths, a timeline spine, cells, layers). Build it as a reusable helper component so scenes can each evolve it. It MUST be in continuous motion (a slow gradient drift, a pulsing hue, a gently shifting pattern) — a static motif gives every scene a dead base layer. The motif's OWN geometry should echo the subject where possible — the motif is the single biggest lever for the lesson NOT looking like every other lesson.
  • TONE: match motion energy to the subject. A meditation lesson breathes slowly; a rocket-launch lesson is kinetic. Don't give every topic the same restless jitter.

SANDBOX API — violate and the build fails:
1. Do NOT write "export" anywhere. This file is only imports + consts + helper function components — no exported component.
2. Import ONLY from "remotion" and "react".
   • From "remotion": any named export EXCEPT staticFile (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop).
   • From "react": ONLY useMemo, useCallback, useRef. useState DOES NOT EXIST here and crashes the video.
   • No other imports of any kind — this is the ONLY place imports are written for the whole lesson.
3. NO props, NO external/dynamic data. Every identifier must be locally declared or a listed remotion/react export.
   • NEVER shadow a JS built-in (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set).
   • NEVER declare a top-level name matching /^Scene\\d+$/ (e.g. Scene1, Scene2) — those are reserved for scenes.
4. Do NOT render <Series>, <Series.Sequence>, or <Audio> anywhere — there is no scene content here to sequence, and no audio to attach.
5. SVG elements (<circle>, <rect>, <line>, <path>, <text>, <g>, <polygon>, <polyline>) ONLY render inside an <svg> tag — a shared helper that returns bare SVG shapes renders NOTHING once a scene drops it into a <div>/<AbsoluteFill> (no crash, no warning — it just silently doesn't exist). Every shared visual helper must be SELF-CONTAINED: either plain HTML (<div>/<AbsoluteFill>) or its OWN full-frame <svg style={{position:"absolute",left:0,top:0,width:1920,height:1080,pointerEvents:"none",overflow:"visible"}}> with the shapes inside.
   • Any helper (like Label/Panel above) that wraps content MUST accept and render {children} ({ children } — NO type annotation; "React" is NOT imported/available here, so "React.ReactNode" or any other "React.X" type crashes with "React is not defined"). A wrapper missing {children} silently drops everything inside it.
6. Any helper using useCurrentFrame() (e.g. an ambient backdrop) resets to 0 every time the scene that mounts it starts — design its motion (Math.sin(frame/k)) so it looks right from frame 0, don't assume accumulation across the whole lesson.

FRAME-BOUNDARY SAFETY — every scene will rely on these exact consts, define them here:
    const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
    const FRAME = { w: 1920, h: 1080 };
    const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
    const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
If this lesson's subject involves direction, vectors, forces, or angles (physics, math, engineering, navigation), also build shared Arrow({from,to,color,width}) and AngleArc({vertex,angle1,angle2,radius,color}) helpers here, computing direction with Math.atan2(dy,dx) — so every scene reuses the SAME correct geometry instead of each one re-deriving it.

SHARED TEXT + FRAMING HELPERS — every scene renders on-screen text, so build these ONCE here instead of leaving each scene to reinvent its own text styling:
  • Label({ children, size }): a text component using PALETTE.text with a strong textShadow (e.g. "0 2px 20px rgba(0,0,0,0.8)") baked in, so text is always readable over the motif regardless of what's behind it. Scenes pass their own position/animation but never redefine the color/shadow.
  • Panel({ children, width, height }) OR Glow({ color, size }) — pick whichever suits the subject better: a soft rounded backdrop card (for grounding text/diagrams over a busy motif) or an ambient glow/particle wisp (for a more atmospheric subject). One small reusable "polish" piece scenes can drop in rather than each hand-rolling its own.

CODE QUALITY:
- Inline styles only (no Tailwind, no className for styling, no external CSS). No registerRoot, no Composition, no export.
- Every helper you declare should be genuinely reusable across scenes — this is the entire point of this file existing separately from scene code.
- Never leave a "TODO" or placeholder — every const/component you declare must be complete, working code a scene could use immediately.

WORKED EXAMPLE — copy the PATTERNS, not the picture. Your own palette/motif must come from YOUR lesson's subject, not this example's colors:

\`\`\`tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PALETTE = {
  bg: "#0a0a1a",
  accent: "#f59e0b",
  support: "#60a5fa",
  text: "#eaf0ff",
};

// LESSON MOTIF: a soft moving gradient wash in the lesson palette, reused as
// the base layer of every scene so the course reads as one piece. Mood
// motion only — it supports atmosphere, it is not the "content".
function Backdrop() {
  const frame = useCurrentFrame();
  const shift = 45 + Math.sin(frame / 60) * 10; // slow, calm — matches a calm subject's tone
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% " + shift + "%, " + PALETTE.bg + ", #05060f 70%)" }} />
  );
}

// SHARED TEXT HELPER: every scene's title/caption goes through this instead
// of hand-rolling its own color/shadow — guarantees readable text over the
// motif in every scene without each one re-deciding it. NO type annotation
// on children — "React" is not imported/available here, so "React.ReactNode"
// or any other "React.X" type crashes with "React is not defined".
function Label({ children, size = 36 }) {
  return (
    <div style={{ color: PALETTE.text, fontSize: size, fontWeight: 700, textShadow: "0 2px 20px rgba(0,0,0,0.8)" }}>
      {children}
    </div>
  );
}
\`\`\`

Begin with imports, then CLAMP/FRAME/SAFE/clampPos, then your palette const, then your shared helper components. Your entire response is the code file, first characters "import", no text or fences around it.
`;

// ── Header user-content builder ──────────────────────────────────────────────
function buildHeaderUserContent(lesson, scenes) {
  const sceneTable = scenes
    .map(
      (s, i) =>
        `Scene ${i + 1}: visualType: ${s.visualType}
   onScreenText: ${s.onScreenText}${s.mechanism?.driver ? `
   driver: ${s.mechanism.driver}` : ""}
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

const SCENE_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "f" (from "function"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer creating ONE SCENE of a visually astonishing educational lesson. This is a premium learning product — the scene must feel alive, dynamic, and visually connected to the concept being taught. The HEADER CODE below (already generated) has this lesson's imports, palette, and shared helper components already declared and in scope — reference those exact names; never redeclare, reimport, or rename them, and never invent a different palette.

This scene has an EXACT frame duration (measured from its voiceover audio) — build it to exactly that duration.

STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
1. Write EXACTLY one top-level declaration: function SceneN() { ... } (using the exact name given to you), with no parameters and no props. Any local helper you need must be a function NESTED inside this one — never a second top-level declaration (it would collide with another scene's code when combined).
2. Do NOT write ANY import statement. Everything you need — AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, the palette consts, the shared helper components — is already imported/declared by the header code below and in scope for you.
   From "react": ONLY useMemo, useCallback, useRef exist. useState DOES NOT EXIST here and crashes the video.
3. NO external/dynamic data. Variables like user, session, props, context do not exist — referencing them crashes with "X is not defined". Every identifier must be locally declared (inside your function), a listed remotion/react export, or something declared in the header code below.
   • NEVER shadow a JS built-in (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set).
4. Do NOT render <Series>, <Series.Sequence>, or <Audio> — this scene is combined with the header and other scenes into those wrappers by other code after you return your function.
5. THIS SCENE'S DURATION is given to you as a literal number (durationInFrames). Hardcode that literal directly in your interpolate() calls for pacing — do not read it from a variable named durationInFrames, it does not exist in scope.
6. FRAME NUMBERS ARE PER-SCENE. useCurrentFrame() resets to 0 at the start of THIS scene — never offset a timing as if earlier scenes' durations apply here. Entrances live near [0, 30]; exits near [thisSceneDuration - 30, thisSceneDuration], written as literals of THIS scene's own duration.
7. Aim for roughly 200-300 lines — use the full budget to create rich, detailed animations. Extract any local helper (ParticleBg, OrbitRing, a small Label variant) once near the top of your function and reuse it, rather than repeating similar JSX blocks.

ANIMATION QUALITY — THIS IS THE MOST CRITICAL REQUIREMENT. A boring animation is a failed animation.
The user is paying for animated video lessons. If the animation is generic, static, or visually uninteresting, the product fails entirely. This scene must feel like a professional motion graphics studio made it.

8. CONTINUOUS MOTION IS NON-NEGOTIABLE. At frame 0, things move. At the midpoint, things move. At the final frame, things move. If anything stops moving after its entrance animation, the scene is wrong. Use Math.sin(frame/k), Math.cos(frame/k), and (frame*speed)%360 to guarantee perpetual motion on every element.

9. ILLUSTRATE THE EXACT CONCEPT — not generic particles. You are given this scene's mechanism (the state it starts in, the state it ends in, and the visible action that drives that change) — build exactly that transformation. A scene where the end state looks the same as the start state has failed regardless of how much motion is on screen. If the concept is DNA replication, show the double helix unwinding with individual base pairs. If it's sorting algorithms, show actual elements moving into order. The animation must make the concept VISIBLE — a viewer with no prior knowledge should understand it from the visuals alone, without reading the text.

10. THREE MANDATORY LAYERS — all three must exist in this scene:
   - Layer 1 (background): the header's Backdrop/motif (already continuously moving) as your base layer. If it isn't a full-screen wash, add one small ambient touch of your own (a couple of slow-drifting, low-opacity shapes).
   - Layer 2 (concept): the main animated diagram — the thing that illustrates what this scene teaches. This is the star of the scene.
   - Layer 3 (text): text that springs or fades in, positioned so it doesn't overlap layer 2.

11. RICHNESS REQUIREMENTS — this scene must have at least:
    - 3+ animated elements (not counting background particles)
    - At least 1 element using spring() for a natural entrance
    - At least 1 element using Math.sin or Math.cos for continuous periodic motion
    - Glow effects (boxShadow with color, from the header's palette) on primary elements to make them pop
    - The onScreenText given below, appearing with a stagger after the visual is established

    THIS IS ENFORCED, NOT A SUGGESTION: a scene consisting of only a title fading in over a plain background, with no shape/diagram illustrating the concept, WILL be rejected and regenerated. Every scene needs a real Layer 2 diagram — text alone is never sufficient, no matter how well-animated the text itself is.

VISUAL CONTINUITY: reuse the header's palette/motif/helpers by NAME — never invent your own colors or redeclare a name the header already declares. Render Layer 3 text through the header's Label helper (not a hand-styled <div>), and use the header's Panel/Glow helper wherever this scene would otherwise hand-roll a text backing or ambient touch. This is what makes 12+ independently-generated scenes read as one designed lesson instead of unrelated clips.

INTERPOLATE SAFETY — these violations CRASH the video at runtime, no exceptions:
12. interpolate() ALWAYS needs exactly 3 arguments: interpolate(value, [in...], [out...]).
    - The 2nd and 3rd arguments (inputRange, outputRange) MUST be array literals written directly in the call — [0, 20] — containing ONLY plain number literals. NEVER a variable holding an array, and NEVER an expression inside the array (no "end - 30", no "i * 8", no "startFrame + 20"). If a value needs to vary, shift the FIRST argument instead: interpolate(frame - i * 8, [0, 20], [0, 1], CLAMP).
    - inputRange strictly increasing, no repeats. [0, 30, 60, 60] crashes — bump the dupe: [0, 30, 60, 61].
    - For hold-at-final-value: use 2 values + CLAMP. interpolate(frame, [0, 30], [0, 1], CLAMP) — NOT [0, 30, 30].
    - GOOD: interpolate(frame, [0, 20], [0, 1], CLAMP) — plain number literals only.
    - This scene's duration is a known literal (given below) — write boundaries directly as that literal, e.g. interpolate(frame, [180, 210], [1, 0], CLAMP) for a 210-frame scene's exit.
13. NEVER produce NaN in any SVG attribute (cx, cy, r, x, y, width, height, points, d):
    - Guard ALL division: write (value / (denominator || 1)).
    - Guard ALL array access: check i < arr.length before arr[i].
    - Math.sin/cos ALWAYS receive a plain finite number.
    - Polygon/polyline points: filter out any NaN before joining: points.filter(p => !isNaN(p.x) && !isNaN(p.y))
14. CLAMP entrance animations so elements don't fly off-screen after settling. Use the header's CLAMP constant for entrance/exit interpolations. For Math.sin/cos continuous motion, CLAMP is NOT needed.
15. THE 1920x1080 FRAME IS A HARD BOUNDARY. Route every final x/y/cx/cy/top/left value through the header's clampPos() to SAFE as its LAST step.
    - Oscillating: compute base ± amp*sin, THEN clamp — never assume it "stays in range".
    - Orbiting: radius ≤ min(centerX-SAFE.xMin, SAFE.xMax-centerX, centerY-SAFE.yMin, SAFE.yMax-centerY). For center (960,540), radius ≤ 420 is always safe.
    - Text: also leave ≥80px margin inside SAFE.
    - When generating random positions, generate INSIDE SAFE from the start, not via Math.random()*1920 then clamp (that piles everything onto the boundary).
16. SVG elements (<circle>, <rect>, <line>, <path>, <text>, <g>, <polygon>, <polyline>) ONLY render inside an <svg> tag — placed directly under a <div> or <AbsoluteFill> they render NOTHING (no crash, no warning). Wrap any group of SVG primitives in its own <svg style={{position:"absolute",left:0,top:0,width:1920,height:1080,pointerEvents:"none",overflow:"visible"}}>...</svg>. The header's shared components are already self-contained — you can place THOSE anywhere.
17. NEVER write comma-separated expressions directly inside JSX curly braces: {a, b} is invalid JSX.

WORKED EXAMPLE — study how EVERY frame has motion, how the concept is illustrated, how layers work together. Your scene's actual visual must be invented from YOUR concept and the header's palette — do NOT reproduce this atom/electron look unless your topic genuinely is atomic structure. Note: CLAMP, SAFE, clampPos, and Backdrop are NOT redeclared here — they come from the header, exactly like yours will.

\`\`\`tsx
// (CLAMP, SAFE, clampPos, PALETTE, Backdrop, Label already exist — from the header, not redeclared here)

function AtomScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Entrance: nucleus springs in
  const nucleusScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  // Continuous: nucleus pulses with sine wave — motion never stops (rule 8)
  const pulse = 1 + Math.sin(frame / 12) * 0.08;
  const labelOpacity = interpolate(frame, [20, 50], [0, 1], CLAMP);

  // Local helper NESTED inside the scene function — never a second
  // top-level declaration (rule 1).
  function OrbitingParticle({ radius, speed, size, color }: { radius: number; speed: number; size: number; color: string }) {
    const angle = (frame * speed * Math.PI) / 180;
    const x = clampPos(960 + Math.cos(angle) * radius, SAFE.xMin, SAFE.xMax);
    const y = clampPos(540 + Math.sin(angle) * radius, SAFE.yMin, SAFE.yMax);
    return (
      <div style={{
        position: "absolute", left: x - size / 2, top: y - size / 2,
        width: size, height: size, borderRadius: "50%", backgroundColor: color,
        boxShadow: "0 0 " + (size * 1.5) + "px " + color,
      }} />
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Backdrop />
      {/* Layer 2: the concept — nucleus + orbiting electrons, all in motion */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%", backgroundColor: PALETTE.accent,
        transform: "scale(" + (nucleusScale * pulse) + ")",
        boxShadow: "0 0 40px " + PALETTE.accent + ", 0 0 80px " + PALETTE.accent + "55",
      }} />
      <OrbitingParticle radius={120} speed={2.4} size={20} color={PALETTE.support} />
      <OrbitingParticle radius={180} speed={1.6} size={16} color={PALETTE.support} />
      {/* Layer 3: text, through the header's Label helper */}
      <div style={{ position: "absolute", bottom: 180, opacity: labelOpacity, letterSpacing: 2 }}>
        <Label size={36}>Electrons orbit the nucleus</Label>
      </div>
    </AbsoluteFill>
  );
}
\`\`\`

Every element above has motion on EVERY frame — the nucleus pulses, electrons orbit at different speeds. There is no static frame. Reference PALETTE/Backdrop/Label/CLAMP/SAFE/clampPos by name exactly as the header declares them; build this scene's OWN concept to this same standard.

Your entire response is the scene's code, first characters "function", no text or fences around it.
`;

// ── Scene naming + user-content builder ─────────────────────────────────────
// Single source of truth for scene component names — used by the scene
// prompt, the validator, and the stitcher, so they can never disagree.
function sceneComponentName(index) {
  return `Scene${index + 1}`;
}

// Ordered so everything IDENTICAL across a lesson's 8-14 scene calls (the
// lesson line + header code block) comes FIRST and everything that varies per
// scene comes LAST — together with the system prompt this forms the longest
// possible shared prefix across those calls, which is what automatic prefix
// caching keys off of (a cache hit requires the prefix to match from the very
// start of the request).
function buildSceneUserContent(lesson, scene, index, totalScenes, headerCode, componentName) {
  const sceneName = sceneComponentName(index);
  const m = scene.mechanism;
  const mechanismBlock =
    m && m.before && m.after && m.driver
      ? `mechanism: starts at "${m.before}", ends at "${m.after}", driven by "${m.driver}"`
      : `mechanism: not provided — derive it from the visualDescription.`;

  return `
LESSON: ${lesson.title} (component ${componentName})

HEADER CODE (already imported/declared — reference these exact names, do not redeclare or reimport):
\`\`\`tsx
${headerCode}
\`\`\`

SCENE ${index + 1} of ${totalScenes}
YOUR FUNCTION NAME (use exactly this): ${sceneName}
durationInFrames: ${scene.durationInFrames}
visualType: ${scene.visualType}${scene.domainSkill && scene.domainSkill !== "none" ? `
domainSkill: ${scene.domainSkill}` : ""}
onScreenText (render verbatim): ${scene.onScreenText}
${mechanismBlock}
visualDescription: ${scene.visualDescription}

Write ONLY the function ${sceneName}, illustrating this scene's mechanism to the standard shown in the worked example above. No import, no export, no <Series>/<Series.Sequence>/<Audio>.
`;
}

// ── Auto-fix common code-generation errors ───────────────────────────────────
// Text-level (not AST) fixes for systematic model slips. Kept deliberately
// narrow: only fixes with a very low false-positive surface; anything
// ambiguous THROWS to trigger a corrective regeneration rather than shipping
// mangled code; every fire logs what it changed.
function autoFixCode(code, { totalFrames } = {}) {
  let fixed = code;
  const notes = [];

  // Fix 1: kebab-case CSS property names → camelCase (object-literal keys).
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

  // Fix 1b: kebab-case SVG attributes in JSX (anchored on "=" so it can't
  // touch style-object keys or prose).
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

  // Fix 2: duplicate/non-increasing inputRange in interpolate() — only when
  // the whole inputRange is plain numeric literals (anything with a variable
  // is skipped). Known limitation: the first-arg matcher stops at the first
  // comma, so a rare `interpolate(spring({frame, fps}), ...)` is skipped —
  // safe, it just doesn't get this fix.
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

  // Fix 2b: unbounded Math.random() * 1920 / * 1080 used directly as a
  // position → safely-inset range (100px margin).
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
  // Left alone if the code DECLARES the identifier anywhere (destructure/
  // param); property access (scene.durationInFrames) excluded via lookbehind.
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

  // Fix 4: HTML-attribute-in-JSX slips. (`\bfor=` is case-sensitive and
  // cannot touch `htmlFor=`; `for (` loops have no "=" and are untouched.)
  fixed = fixed.replace(/\bclass=/g, "className=");
  fixed = fixed.replace(/\bfor=/g, "htmlFor=");

  // Fix 5: unterminated template literal → fail loudly (guessing a closer
  // only produces a new kind of invalid code).
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
// Ad path only (the lesson path's stitcher writes URLs deterministically, so
// this class of bug is structurally impossible there). Scenes are always
// wired IN ORDER, so match each <Audio src> occurrence to the corresponding
// scene's guaranteed-correct URL and force-replace on mismatch. Matches both
// src={"url"} and the plain src="url" slip.
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
// backticks inside the code's own template literals). Shared by header,
// scene, and ad paths.
function stripCodeFences(text) {
  return text
    .trim()
    .replace(/^```(?:tsx|typescript|ts|jsx|js)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function logUsage(label, usage) {
  if (!usage) return;
  console.log(
    `  [${label}] tokens: ${usage.prompt_tokens} in ` +
    `(${usage.prompt_cache_hit_tokens ?? 0} cache hit / ${usage.prompt_cache_miss_tokens ?? 0} cache miss), ` +
    `${usage.completion_tokens} out`
  );
}

// ── Streaming with an idle watchdog ─────────────────────────────────────────
// Streams one chat-completion request through a concurrency limiter, holding
// the slot for the ENTIRE request lifetime (open stream + consume every
// chunk) — releasing at create()-resolution would allow far more than N
// sockets at once.
//
// NEW: an idle watchdog aborts the request if no chunk arrives for
// CODEGEN_STREAM_IDLE_TIMEOUT_MS (default 90s). Rationale: the SDK's 300s
// timeout guards the initial response, but a stream that opened fine and
// then STALLED mid-generation previously hung until the full 300s ceiling —
// this is the "one stuck scene adds a minute to the whole lesson" pattern
// observed live. A healthy GLM stream emits chunks continuously, so 90s of
// total silence is a dead connection; abort → transport error → the caller's
// retry loop rerolls immediately instead of waiting out the ceiling.
const STREAM_IDLE_TIMEOUT_MS = Number(process.env.CODEGEN_STREAM_IDLE_TIMEOUT_MS) || 90 * 1000;

async function streamCodeCompletion({ limiter, provider, systemPrompt, userContent, maxOutputTokens }) {
  return limiter(() =>
    provider.isAnthropicNative
      ? streamAnthropicNative({ provider, systemPrompt, userContent, maxOutputTokens })
      : streamOpenAiCompatible({ provider, systemPrompt, userContent, maxOutputTokens })
  );
}

// GLM (Z.ai) and Fable (OpenRouter) both speak the OpenAI chat-completions
// wire shape — this is that path.
async function streamOpenAiCompatible({ provider, systemPrompt, userContent, maxOutputTokens }) {
  const controller = new AbortController();
  const stream = await provider.client.chat.completions.create(
    {
      model: provider.model,
      ...provider.extraParams,
      max_tokens: maxOutputTokens ?? provider.maxTokens ?? 100000,
      stream: true,
      // OpenAI-spec field — without it, a streamed response never carries a
      // `usage` chunk at all, so cache hit/miss and completion tokens would
      // be invisible to this codebase entirely.
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    },
    { signal: controller.signal }
  );

  let streamedText = "";
  let finishReason = null;
  let usage = null;
  let lastChunkAt = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastChunkAt > STREAM_IDLE_TIMEOUT_MS) controller.abort();
  }, 5000);

  try {
    for await (const chunk of stream) {
      lastChunkAt = Date.now();
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) streamedText += delta.content; // ignore reasoning_content
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      // The usage chunk arrives LAST with an empty `choices` array — never
      // gate it behind the finish_reason check above.
      if (chunk.usage) usage = chunk.usage;
    }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `Stream stalled — no data received for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)}s, idle watchdog aborted the request (had ${streamedText.length} chars so far)`
      );
    }
    throw err;
  } finally {
    clearInterval(watchdog);
  }

  return { text: streamedText, stopReason: finishReason, usage };
}

// Claude Sonnet 5 direct — Anthropic's own Messages API. Different wire
// shape from the OpenAI-compatible path above: content arrives as
// content_block_delta events (not delta.content), truncation is signaled by
// stop_reason "max_tokens" (not finish_reason "length" — normalized below so
// every call site's `stopReason === "length"` check keeps working
// unmodified), and usage fields are input_tokens/output_tokens plus separate
// cache_read/cache_creation counts rather than a single prompt/completion
// pair — normalized into the same shape logUsage() already expects so it
// doesn't need a provider-specific branch either.
async function streamAnthropicNative({ provider, systemPrompt, userContent, maxOutputTokens }) {
  const controller = new AbortController();
  const stream = provider.client.messages.stream(
    {
      model: provider.model,
      ...provider.extraParams,
      max_tokens: maxOutputTokens ?? provider.maxTokens ?? 100000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    },
    { signal: controller.signal }
  );

  let streamedText = "";
  let stopReason = null;
  let rawUsage = null;
  let lastChunkAt = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastChunkAt > STREAM_IDLE_TIMEOUT_MS) controller.abort();
  }, 5000);

  try {
    for await (const event of stream) {
      lastChunkAt = Date.now();
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        streamedText += event.delta.text;
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage) rawUsage = { ...rawUsage, ...event.usage };
      } else if (event.type === "message_start" && event.message?.usage) {
        rawUsage = { ...rawUsage, ...event.message.usage };
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `Stream stalled — no data received for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)}s, idle watchdog aborted the request (had ${streamedText.length} chars so far)`
      );
    }
    throw err;
  } finally {
    clearInterval(watchdog);
  }

  // "max_tokens" -> "length" so the shared truncation check downstream
  // (`stopReason === "length"`) doesn't need to know which provider ran.
  const normalizedStopReason = stopReason === "max_tokens" ? "length" : stopReason;

  const usage = rawUsage
    ? {
        prompt_tokens: (rawUsage.input_tokens ?? 0) + (rawUsage.cache_creation_input_tokens ?? 0) + (rawUsage.cache_read_input_tokens ?? 0),
        completion_tokens: rawUsage.output_tokens ?? 0,
        prompt_cache_hit_tokens: rawUsage.cache_read_input_tokens ?? 0,
        prompt_cache_miss_tokens: (rawUsage.input_tokens ?? 0) + (rawUsage.cache_creation_input_tokens ?? 0),
      }
    : null;

  return { text: streamedText, stopReason: normalizedStopReason, usage };
}

// Reasoning is OFF for both (LESSON_HEADER_PROVIDER / LESSON_SCENE_PROVIDER
// above), so these budgets only need to cover the actual code, not hidden
// reasoning tokens. Scenes get more because individual scenes have run up to
// ~300 lines of real content.
const HEADER_MAX_OUTPUT_TOKENS = 32000;
const SCENE_MAX_OUTPUT_TOKENS = 72000;

// ── Header generation ───────────────────────────────────────────────────────
async function generateLessonHeader(lesson, scenes, maxAttempts = 2) {
  const label = `header L${lesson.lessonNumber}`;
  const start = Date.now();

  return withRetries(label, maxAttempts, async ({ attempt, feedback }) => {
    console.log(`  [${label}] Attempt ${attempt}/${maxAttempts}...`);

    const { text, stopReason, usage } = await streamCodeCompletion({
      limiter: limitLessonHeaderCall,
      provider: LESSON_HEADER_PROVIDER,
      systemPrompt: HEADER_CODE_GEN_RULES,
      userContent: buildHeaderUserContent(lesson, scenes) + feedbackSuffix(feedback),
      maxOutputTokens: HEADER_MAX_OUTPUT_TOKENS,
    });
    logUsage(label, usage);

    // Everything after a fully-received stream is a CONTENT problem — tag it
    // so withRetries threads the message back into the next attempt's prompt.
    try {
      if (stopReason === "length") {
        throw new Error("Header hit max_tokens — code was truncated. Generate more compact code.");
      }

      const code = stripCodeFences(text);
      if (!/^(import|const|function|\/\/|\/\*)/.test(code)) {
        throw new Error("Header output wasn't code — you MUST output only TSX code starting with `import`.");
      }

      const fixed = autoFixCode(code, {});
      const validated = validateHeaderFragment(fixed);

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  [${label}] Valid header generated (${validated.length} chars) — took ${elapsedSec}s`);
      return validated;
    } catch (err) {
      err.isContentError = true;
      throw err;
    }
  }, { keyEnv: LESSON_HEADER_PROVIDER.keyEnv, stage: "header" });
}

// ── Per-scene code generation ───────────────────────────────────────────────
// Given the already-validated header as context. Own retry loop scoped to
// just this scene — a syntax slip in scene 7 only costs re-rolling scene 7.
async function generateSceneCode(lesson, scene, index, totalScenes, headerCode, headerAvailableNames, componentName, maxAttempts = 2) {
  const sceneName = sceneComponentName(index);
  const label = `scene ${index + 1} L${lesson.lessonNumber}`;
  const start = Date.now();

  // compactHeaderForPrompt strips shared-component BODIES (a scene never
  // needs to know how Backdrop/Arrow animate internally, only their names/
  // signatures) — cuts what's resent on every one of this lesson's 8-14
  // scene calls, and buildSceneUserContent keeps it in the shared-prefix
  // position for prefix caching (see its comment).
  const compactHeader = compactHeaderForPrompt(headerCode);

  return withRetries(label, maxAttempts, async ({ feedback }) => {
    const { text, stopReason, usage } = await streamCodeCompletion({
      limiter: limitLessonSceneCall,
      provider: LESSON_SCENE_PROVIDER,
      systemPrompt: SCENE_CODE_GEN_RULES,
      userContent: buildSceneUserContent(lesson, scene, index, totalScenes, compactHeader, componentName) + feedbackSuffix(feedback),
      maxOutputTokens: SCENE_MAX_OUTPUT_TOKENS,
    });
    logUsage(label, usage);

    try {
      if (stopReason === "length") {
        throw new Error(`Scene ${index + 1} hit max_tokens — code was truncated. Generate more compact code.`);
      }

      const code = stripCodeFences(text);
      if (!/^(function|const)\s/.test(code)) {
        throw new Error(`Scene ${index + 1} output wasn't code — you MUST output only a \`function ${sceneName}\` declaration.`);
      }

      const fixed = autoFixCode(code, { totalFrames: scene.durationInFrames });
      const validated = validateSceneFragment(fixed, sceneName, { headerAvailableNames });

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  [${label}] Valid code generated (${validated.length} chars) — took ${elapsedSec}s for ${sceneName}`);
      return validated;
    } catch (err) {
      err.isContentError = true;
      throw err;
    }
  }, { keyEnv: LESSON_SCENE_PROVIDER.keyEnv });
}

// ── Deterministic stitcher ──────────────────────────────────────────────────
// Non-LLM assembly: header + every scene's function component + a <Series>
// wrapper built directly from known scene metadata (durationInFrames,
// audioUrl) — never transcribed by the model, so a duration-sum drift or a
// mistyped audio URL is structurally impossible on this path. `sceneIndices`
// (optional) gives each entry's REAL scene index for partial stitches (e.g. a
// single-scene preview of scene 3, whose LOCAL index is 0 but whose
// component is "Scene4"). Defaults to local order — the normal full-lesson
// stitch.
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

// ── Full-lesson orchestration ───────────────────────────────────────────────
// `scenePlan` is the raw scene-plan array (no audio measurements — used for
// scene count and header regen). `scenePromises[i]` resolves to scene i's
// FULL measured version (plan fields + durationInFrames/audioUrl from TTS);
// each scene's code generation awaits ONLY its own promise, so scene 1's code
// starts the moment scene 1's audio is ready, without waiting on scene 12's.
//
// Retry topology:
//   • ALL scenes fire at once; real concurrency is bounded ONLY by the
//     limitLessonSceneCall semaphore (100), which rolls — the instant a slot
//     frees, the next queued scene takes it.
//   • Each scene owns its FULL retry budget (SCENE_MAX_ATTEMPTS_PER_LESSON)
//     inside its own generateSceneCode call — no round barrier.
//   • Per-scene progress notifications attach to EACH scene's own promise
//     via .then(), never to the awaited allSettled result — otherwise every
//     notification waits for the slowest scene overall.
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

  const SCENE_MAX_ATTEMPTS_PER_LESSON = 6;

  // Header reuse across outer attempts. The header and the scenes are
  // independent failure domains — when an outer attempt dies because scenes
  // failed, regenerating a header that already validated is pure waste.
  // Policy:
  //   attempt 1           → caller's prefetched headerPromise (or fresh)
  //   middle attempts     → reuse the last validated header, UNLESS the
  //                         failure was header-stage
  //   final attempt       → always fresh
  let reusableHeader = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  [code L${lesson.lessonNumber}] Outer attempt ${attempt}/${maxAttempts} for ${componentName} (header + ${scenePlan.length} scenes)...`);

      let header;
      if (attempt === 1 && headerPromise) {
        header = await headerPromise;
      } else if (reusableHeader && lastError?.stage !== "header" && attempt < maxAttempts) {
        console.log(`  [code L${lesson.lessonNumber}] Reusing validated header from a previous attempt (prior failure was not header-stage).`);
        header = reusableHeader;
      } else {
        header = await generateLessonHeader(lesson, scenePlan);
      }
      reusableHeader = header;
      const headerAvailableNames = getHeaderExposedNames(header);

      const sceneCodes = new Array(scenePlan.length).fill(null);
      const sceneErrors = new Array(scenePlan.length).fill(null);

      await Promise.allSettled(
        scenePlan.map((_, i) =>
          scenePromises[i].then((measuredScene) =>
            generateSceneCode(lesson, measuredScene, i, scenePlan.length, header, headerAvailableNames, componentName, SCENE_MAX_ATTEMPTS_PER_LESSON).then((code) => {
              sceneCodes[i] = code;
              sceneErrors[i] = null;

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
        const err = contentError(
          `${stillFailingIndices.length}/${scenePlan.length} scene(s) still failing after ${SCENE_MAX_ATTEMPTS_PER_LESSON} attempts each: ${detail}`
        );
        const audioFailure = stillFailingIndices.find((i) => sceneErrors[i]?.stage === "audio");
        if (audioFailure !== undefined) err.stage = "audio";
        throw err;
      }

      const measuredScenes = await Promise.all(scenePromises);
      const totalFrames = measuredScenes.reduce((sum, s) => sum + s.durationInFrames, 0);

      const stitched = stitchLessonCode({ header, sceneCodes, scenes: measuredScenes, componentName });

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
          `Lesson code generation failed with a non-retryable error (check ${LESSON_SCENE_PROVIDER.keyEnv}): ${describeError(err)}`
        );
      }

      console.warn(`  [code L${lesson.lessonNumber}] Outer attempt ${attempt} failed: ${describeError(err)}. Retrying...`);
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
// AD GENERATION — same sandbox/autofix/validate machinery as lessons,
// ad-tuned prompt. An ad is ONE component (a <Series> of short punchy
// scenes). Crash-safety identical; aesthetic commercial, not educational.
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
  return withRetries("ad-code", maxAttempts, async ({ attempt, feedback }) => {
    console.log(`  [ad-code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`);

    // Now shares streamCodeCompletion — the ad path gets the idle watchdog
    // and usage logging for free (it previously carried its own inline copy
    // of the streaming loop with neither).
    const { text, stopReason, usage } = await streamCodeCompletion({
      limiter: limitAdCodeCall,
      provider: AD_CODE_PROVIDER,
      systemPrompt: AD_CODE_GEN_RULES,
      userContent: buildAdUserContent(ad, componentName, scenes, totalFrames) + feedbackSuffix(feedback),
      maxOutputTokens: AD_CODE_PROVIDER.maxTokens,
    });
    logUsage("ad-code", usage);

    try {
      if (stopReason === "length") {
        throw new Error("Hit max_tokens — ad code truncated. Generate more compact code.");
      }

      const code = stripCodeFences(text);
      if (!/^(import|const|\/\/|\/\*|export)/.test(code)) {
        throw new Error("Model output plain text instead of TSX — output only TSX starting with `import`.");
      }

      const fixedCode = autoFixCode(code, { totalFrames });
      const audioFixedCode = enforceCorrectAudioUrls(fixedCode, scenes);
      const validatedCode = validateGeneratedCode(audioFixedCode, componentName, totalFrames);

      console.log(`  [ad-code] Valid ad code generated (${validatedCode.length} chars) for ${componentName}`);
      return validatedCode;
    } catch (err) {
      err.isContentError = true;
      throw err;
    }
  }, { keyEnv: AD_CODE_PROVIDER.keyEnv });
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
  // can run their own calls on whichever model is actually configured for
  // lesson code (LESSON_CODE_MODEL=glm|fable|claude) — one provider choice,
  // one place to change it.
  LESSON_CODE_PROVIDER,
  SCENE_PLAN_PROVIDER,
  // sceneService.js's generateScenePlan runs on DeepSeek now (thinking high),
  // not GLM — see the "DEEPSEEK" comment block above SCENE_PLAN_PROVIDER.
  DEEPSEEK_SCENE_PLAN_PROVIDER,
  streamCodeCompletion,
  // Z.ai concurrency limiter (serialized to 1) — remedial/next-course
  // generation (still GLM) uses this for its Z.ai-direct calls. Lesson header
  // and per-scene code generation use their own separate
  // limitLessonHeaderCall/limitLessonSceneCall, internal to this file only.
  limitZaiCall,
  // DeepSeek's own shared account-wide concurrency pool — sceneService.js's
  // generateScenePlan AND levelAssessmentService.js's pre-course level check
  // both hit DeepSeek directly and import this same limiter so their traffic
  // is coordinated against one account cap, exactly like limitZaiCall above.
  limitDeepSeekCall,
  describeError,
  isNonRetryable,
  backoffDelay,
};