const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");
const pdfParse = require("pdf-parse");
const JSZip = require("jszip");
const { validateGeneratedCode } = require("./validateCode");
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
// selects — generateLessonCode's single call always runs with reasoning off
// (deterministic code generation gets nothing from a hidden chain-of-thought,
// and on GLM it would draw unbounded invisible tokens from the same output
// budget as the actual code).
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
// Lesson code generation is now ONE call per lesson (not N per-scene calls),
// so limitLessonCodeCall gates concurrent WHOLE-LESSON calls instead —
// shared across every lesson a course builds, regardless of which
// LESSON_CODE_MODEL client actually handles it. Default 6: GLM-5.2 is a
// sparse MoE model (~40B active of far more total params per token), whose
// serving infra (vLLM/SGLang) routes experts per-request rather than one
// request blocking the whole model, so it handles several full-lesson
// requests concurrently without the per-request slowdown a dense model
// would show. courseController.js now builds every lesson in a course
// concurrently (buildLessonsConcurrently) instead of one at a time, so this
// pool is what actually bounds how many of those run their code-gen call at
// once — tune LESSON_CODE_MAX_CONCURRENT down if connection-drop errors
// reappear under multi-user load.
const ZAI_MAX_CONCURRENT = Number(process.env.ZAI_MAX_CONCURRENT) || 1;
const limitZaiCall = createLimiter(ZAI_MAX_CONCURRENT);
const LESSON_CODE_MAX_CONCURRENT = Number(process.env.LESSON_CODE_MAX_CONCURRENT) || 6;
const limitLessonCodeCall = createLimiter(LESSON_CODE_MAX_CONCURRENT);
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
// LESSON CODE-GEN PROMPT — single call, whole lesson
// ═══════════════════════════════════════════════════════════════════════════
// ONE call generates the entire lesson: every scene plus the exported
// <Series> wrapper that plays them with their narration audio. This
// deliberately replaces an earlier header-call + N-parallel-per-scene-calls
// design — that split let scenes run concurrently, but each scene's call
// could only ever see the shared header, never its sibling scenes, so
// cross-scene coherence had to be IMPOSED via an increasingly elaborate
// prompt instead of arising naturally from the model seeing the whole
// lesson at once. A single call trades that concurrency for letting the
// model hold the entire lesson in context — closer to how a person would
// actually storyboard one continuous piece.
//
// The prompt below is deliberately concise: a short list of hard
// requirements, one clear worked example, and trust in the model's own
// judgment for everything else — not a mandatory per-scene planning
// checklist. Crash-safety rules (interpolate shape, clamping, forbidden
// imports, duration sum) are kept in full — those reflect real runtime
// constraints of the browser sandbox, not compensations for model weakness.

const LESSON_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: You MUST respond with ONLY raw TypeScript/TSX code. No explanations, no descriptions, no topic summaries, no markdown. The FIRST character of your response must be "i" (from "import"). If you output anything other than TSX code, the entire system fails and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer creating visually astonishing educational animations. This is a premium learning product — every scene must feel alive, dynamic, and visually connected to the concept being taught.

Generate a complete, self-contained Remotion composition for a lesson. Each scene has an EXACT frame duration (measured from its voiceover audio) and you MUST build each scene to that exact duration.

STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
1. The component MUST be named exactly as given below and exported as a named export: export const ComponentName = () => { ... }
2. Import ONLY from "remotion" and "react".
   From "remotion": ANY named export works (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop) — EXCEPT staticFile, which is not available.
   From "react": ONLY useMemo, useCallback, useRef. DO NOT use useState — it DOES NOT EXIST in this sandbox. Using useState will crash the video.
   Do NOT import from any other library.
3. The component takes NO props — all data is hardcoded.
4. Structure: a single <Series> with one <Series.Sequence> per scene, IN ORDER. Do NOT use a bare <Sequence> anywhere, including inside a scene component. A <Sequence from={...} durationInFrames={...}> nested inside a scene will UNMOUNT its children once its own duration elapses — even if that's shorter than the scene's real duration — which makes the visual disappear while the audio (in the parent Series.Sequence) keeps playing. If part of a scene should only show for a portion of the scene, control that with interpolate()-driven opacity/scale on an always-mounted element, never by wrapping it in a shorter-lived Sequence.
5. Each <Series.Sequence durationInFrames={EXACT_NUMBER}> — copy the number EXACTLY. Never compute or round it.
6. Inside each sequence: <Audio src={"EXACT_URL"} /> — copy URLs exactly, NO staticFile() wrapper.

ANIMATION QUALITY — THIS IS THE MOST CRITICAL REQUIREMENT. A boring animation is a failed animation.
The user is paying for animated video lessons. If the animations are generic, static, or visually uninteresting, the product fails entirely. Every scene must feel like a professional motion graphics studio made it.

7. CONTINUOUS MOTION IS NON-NEGOTIABLE. At frame 0, things move. At frame 100, things move. At frame 200, things move. If anything stops moving after its entrance animation, the scene is wrong. Use Math.sin(frame/k), Math.cos(frame/k), and (frame*speed)%360 to guarantee perpetual motion on every element.

8. ILLUSTRATE THE EXACT CONCEPT — not generic particles. If the topic is DNA replication, show the double helix unwinding with individual base pairs. If it's photosynthesis, show photons hitting chlorophyll and electrons jumping energy levels. If it's sorting algorithms, show actual elements moving into order. If it's electromagnetism, show field lines rotating. The animation must make the concept VISIBLE — a viewer with no prior knowledge should understand the concept from the visuals alone, without reading the text. Each scene below is given its mechanism (the state it starts in, the state it ends in, and the visible action that drives that change) — build exactly that transformation; a scene where the end state looks the same as the start state has failed regardless of how much motion is on screen.

9. THREE MANDATORY LAYERS — all three must exist in every scene:
   - Layer 1 (background): Continuously moving gradient, rotating color field, or drifting particle system. Never static.
   - Layer 2 (concept): The main animated diagram — the thing that illustrates what the scene teaches. This is the star of the scene.
   - Layer 3 (text): Text that springs or fades in, positioned so it doesn't overlap layer 2.

10. RICHNESS REQUIREMENTS — every scene must have at least:
    - 3+ animated elements (not counting background particles)
    - At least 1 element using spring() for a natural entrance
    - At least 1 element using Math.sin or Math.cos for continuous periodic motion
    - Colors chosen to match the concept (biology = greens, physics = blues/purples, chemistry = warm colors)
    - Glow effects (boxShadow with color) on primary elements to make them pop
    - The concept name or key formula as text, appearing with a stagger after the visual is established

    THIS IS ENFORCED, NOT A SUGGESTION: a scene consisting of only a title fading in over a plain background, with no shape/diagram illustrating the concept, WILL be rejected and regenerated. Every scene needs a real Layer 2 diagram — text alone is never sufficient, no matter how well-animated the text itself is.

VISUAL CONTINUITY ACROSS THE LESSON: you can see every scene below in one place — use that. Pick ONE palette and one or two recurring visual motifs (a shape, a color treatment, a layout habit) at the start and carry them through every scene, so the lesson reads as one designed piece, not unrelated clips. Don't force identical content between scenes — each still illustrates its OWN concept — just keep the same visual "voice."

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
    const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    Apply this pattern to EVERY positioned element, with no exceptions:
    - Static/random position: const x = clampPos(rawX, SAFE.xMin, SAFE.xMax); const y = clampPos(rawY, SAFE.yMin, SAFE.yMax);
    - Oscillating (base ± amplitude*sin/cos): compute the raw value, THEN clamp it — never trust that base±amplitude "should" stay in range:
      const rawY = baseY + Math.sin(frame / 10) * amplitude;
      const y = clampPos(rawY, SAFE.yMin, SAFE.yMax);
    - Orbiting: radius must satisfy centerX ± radius and centerY ± radius both land within SAFE — i.e. radius ≤ min(centerX - SAFE.xMin, SAFE.xMax - centerX, centerY - SAFE.yMin, SAFE.yMax - centerY). For a center at (960, 540), radius ≤ 420 is always safe.
    - Text: position from SAFE bounds too, and additionally leave ≥80px margin from SAFE's own edges since text has width/height beyond its anchor point.
    - Particles/background elements: also clamp, even though they're decorative — an off-screen particle wastes a draw call and a few stray ones drifting to the edge look like a bug to the viewer.

    This clamp MUST be the last operation applied to any x/y/cx/cy/top/left value before it's used in a style or SVG attribute — clamping the raw input to a formula and then adding more offsets afterward defeats the purpose.

CODE QUALITY:
15. Sum of all durationInFrames MUST equal the total given. Verify before finishing.
16. Inline styles ONLY. No Tailwind, no external CSS, no className for styling.
17. No registerRoot, no Composition.
18. Each scene component should be 200-300 lines — use the full budget to create rich, detailed animations. Extract shared helper components (ParticleBg, OrbitRing, Label) once near the top and reuse them across scenes, both to avoid repetition and to reinforce the lesson's visual continuity (see above).
19. Every <Series.Sequence> must have a positive integer durationInFrames ≥ 1.
20. NEVER write comma-separated expressions directly inside JSX curly braces: {a, b} is invalid JSX. Use separate expressions, or wrap in parens: {(a, b)} — but better to split into separate JSX attributes or elements.
21. SVG elements (<circle>, <rect>, <line>, <path>, <text>, <g>, <polygon>, <polyline>) ONLY render inside an <svg> tag — placed directly under a <div> or <AbsoluteFill> they render NOTHING (no crash, no warning, the shape silently doesn't exist). Wrap any group of SVG primitives in its own <svg style={{position:"absolute",left:0,top:0,width:1920,height:1080,pointerEvents:"none",overflow:"visible"}}>...</svg>.

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

Begin with imports, then the CLAMP/FRAME/SAFE/clampPos constants, then any shared helper components, then the main component.
`;

function buildLessonUserContent(lesson, componentName, scenes, totalFrames) {
  const sceneTable = scenes
    .map((s, i) => {
      const m = s.mechanism;
      const mechanismLine =
        m && m.before && m.after && m.driver
          ? `\n   mechanism: starts at "${m.before}", ends at "${m.after}", driven by "${m.driver}"`
          : "";
      return `Scene ${i + 1}: durationInFrames=${s.durationInFrames}, audioUrl="${s.audioUrl}", targetLines=200-300
   visualType: ${s.visualType}
   onScreenText: ${s.onScreenText}
   visualDescription: ${s.visualDescription}${mechanismLine}`;
    })
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

// Reasoning is OFF for both, so these budgets only need to cover the actual
// code plus headroom — no reasoning tokens draw from them. Scenes get more
// because individual scenes have run up to ~30k tokens of real content.
// Reasoning is OFF: this is deterministic code generation, not a task that
// benefits from a hidden chain-of-thought, and (for GLM specifically) leaving
// it on draws unbounded invisible reasoning tokens from this SAME budget.
const LESSON_MAX_OUTPUT_TOKENS = 100000;

// ── Full-lesson single-call generation ──────────────────────────────────────
// ONE call generates the entire lesson file (imports + shared helpers + every
// scene + the exported <Series> wrapper) — see LESSON_CODE_GEN_RULES above
// for why this replaced an earlier header + per-scene-call split.
//
// `scenePromises[i]` resolves to scene i's FULL measured version (plan
// fields + durationInFrames/audioUrl from TTS) — every scene's audio must be
// measured before this one request can be built, so unlike a per-scene
// design, code generation starts only after the slowest scene's audio
// finishes, not scene-by-scene as each one's audio completes.
async function generateLessonCode(lesson, componentName, scenePromises, maxAttempts = 3) {
  const lessonStart = Date.now();

  // A scene whose audio permanently failed rejects here — ttsService tags
  // that rejection with `.stage = "audio"` so buildLesson reports it as an
  // audio failure, not a code one, and skips retries that can't fix it.
  let measuredScenes;
  try {
    measuredScenes = await Promise.all(scenePromises);
  } catch (err) {
    if (!err.stage) err.stage = "audio";
    throw err;
  }

  const totalFrames = measuredScenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  const userContent = buildLessonUserContent(lesson, componentName, measuredScenes, totalFrames);
  // Reasoning off regardless of which model LESSON_CODE_MODEL selects — see
  // withReasoningOff's own comment for why the toggle field differs by client.
  const provider = withReasoningOff(LESSON_CODE_PROVIDER);

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  [code] Attempt ${attempt}/${maxAttempts} for ${componentName} (${measuredScenes.length} scenes, one call)...`);

      const { text, stopReason, usage } = await streamCodeCompletion({
        limiter: limitLessonCodeCall,
        provider,
        systemPrompt: LESSON_CODE_GEN_RULES,
        userContent,
        maxOutputTokens: Math.min(LESSON_MAX_OUTPUT_TOKENS, provider.maxTokens),
      });
      logUsage("code", usage);

      if (stopReason === "length") {
        throw contentError("Hit max_tokens — code was truncated");
      }

      const code = stripCodeFences(text);

      // Detect plain text output — a model occasionally ignores the prompt
      // and describes the topic instead of writing TSX. Catch this early.
      if (!/^(import|const|\/\/|export)/.test(code)) {
        throw contentError("Model output plain text instead of TSX code — ignoring system prompt");
      }

      const fixedCode = autoFixCode(code, { totalFrames });
      // The model transcribes audio URLs itself on this path (unlike the old
      // split pipeline's deterministic stitcher) — force-correct any
      // mistyped URL against the real per-scene files, same safety net the
      // ad path already relies on.
      const audioFixedCode = enforceCorrectAudioUrls(fixedCode, measuredScenes);
      const validatedCode = validateGeneratedCode(audioFixedCode, componentName, totalFrames);

      const review = await reviewGeneratedCode(validatedCode, lesson);
      if (!review.skipped && review.ok === false) {
        throw contentError(`Code critic flagged issues: ${review.issues?.join("; ") || "unspecified"}`);
      }

      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      console.log(`  [code] Valid code generated (${validatedCode.length} chars) — took ${elapsedSec}s for ${componentName}`);
      return { code: validatedCode, totalFrames };
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Lesson code generation failed with a non-retryable error (check ${provider.keyEnv}): ${describeError(err)}`);
      }
      console.warn(`  [code] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`);
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
  // generation (still GLM) uses this for its Z.ai-direct calls. Lesson code
  // generation uses its own separate limitLessonCodeCall, internal to this
  // file only.
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