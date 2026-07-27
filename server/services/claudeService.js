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

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER TABLE
// ═══════════════════════════════════════════════════════════════════════════
// Reasoning is OFF everywhere on GLM by design: GLM's native `thinking` field
// has no token cap (unlike OpenRouter's old unified shape), so leaving it on
// meant unbounded invisible reasoning tokens — measured 200-870+ seconds per
// call at "high" effort, 987s+ for one lesson's code stage. The prompts below
// compensate by forcing the model to write its plan VISIBLY (see the
// MECHANISM/COLLISION comment block in SCENE_CODE_GEN_RULES).
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

// Derive reasoning-off variants for the header and per-scene calls. Kept as
// separate consts (not just LESSON_CODE_PROVIDER reused) so either can be
// given different settings later without re-wiring call sites.
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
const HEADER_PROVIDER = withReasoningOff(LESSON_CODE_PROVIDER);
const SCENE_CODE_PROVIDER = withReasoningOff(LESSON_CODE_PROVIDER);

// Scene-plan / course-plan / remedial / next-course: bounded, fixed-shape JSON
// (not code) on GLM 5.2 via Z.ai directly. Its own provider object so this
// call category can diverge later without re-wiring call sites.
const SCENE_PLAN_PROVIDER = {
  client: zaiClient,
  model: "glm-5.2",
  extraParams: { thinking: { type: "disabled" } },
  maxTokens: 40000,
  keyEnv: "ZAI_API_KEY",
};

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENCY
// ═══════════════════════════════════════════════════════════════════════════
// Z.ai enforces ONE account-wide concurrency cap (10) across all models and
// endpoints. Two pools:
//   limitZaiCall (default 1)       — header, scene-plan, course-plan, remedial,
//                                    next-course. Low volume/short calls; the
//                                    connection-drop risk under concurrency
//                                    isn't worth the tiny time saved.
//   limitZaiSceneCall (default 10) — per-scene code, the call type with real
//                                    volume (8-15/lesson) that concurrency helps.
// In normal single-course operation the two pools don't overlap in time
// (header fully resolves before any scene call; plans run in an earlier
// stage). Multiple concurrent courses CAN push combined requests over 10 —
// tune ZAI_SCENE_MAX_CONCURRENT down if the ETIMEDOUT/ENETUNREACH failures
// documented in git history reappear under multi-user load.
const ZAI_MAX_CONCURRENT = Number(process.env.ZAI_MAX_CONCURRENT) || 1;
const limitZaiCall = createLimiter(ZAI_MAX_CONCURRENT);
const ZAI_SCENE_MAX_CONCURRENT = Number(process.env.ZAI_SCENE_MAX_CONCURRENT) || 10;
const limitZaiSceneCall = createLimiter(ZAI_SCENE_MAX_CONCURRENT);
const AD_CODE_MAX_CONCURRENT = Number(process.env.AD_CODE_MAX_CONCURRENT) || 3;
const limitAdCodeCall = createLimiter(AD_CODE_MAX_CONCURRENT);

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
// caller-supplied shape validation, and — new — corrective feedback on retry
// (previously JSON retries were blind rerolls; now a shape-validation failure
// message rides into the next attempt's prompt exactly like code-gen does).
async function generateJson({ label, maxAttempts, maxTokens, buildMessages, validate }) {
  return withRetries(label, maxAttempts, async ({ feedback }) => {
    const response = await limitZaiCall(() =>
      SCENE_PLAN_PROVIDER.client.chat.completions.create({
        model: SCENE_PLAN_PROVIDER.model,
        ...SCENE_PLAN_PROVIDER.extraParams,
        max_tokens: maxTokens,
        messages: buildMessages(feedback),
      })
    );

    const choice = response.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw contentError(`${label} response hit max_tokens and was truncated — the JSON is incomplete`);
    }

    const text = choice?.message?.content || "";
    const parsed = safeParseJson(text);
    return validate(parsed, text);
  }, { keyEnv: SCENE_PLAN_PROVIDER.keyEnv }); // FIX: this used to report LESSON_CODE_PROVIDER.keyEnv, which is WRONG whenever LESSON_CODE_MODEL=fable — plan calls always run on Z.ai.
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

  // GLM is a text endpoint — it can't ingest raw document bytes. Extract text
  // first (PDF via pdf-parse, PPTX via extractPptxText), capped at
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
    // FIX: was a flat 8000, which a large tier (e.g. 10 lessons / 40 MCQs from
    // courseController's tier-priced path) could genuinely exceed — scale the
    // budget with the requested shape instead.
    maxTokens: Math.min(16000, 3000 + lessonCount * 500 + mcqCount * 200),
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
// LESSON CODE-GEN PROMPTS — split-call generation
// ═══════════════════════════════════════════════════════════════════════════
// One header call decides the lesson's VISUAL IDENTITY (imports, palette,
// motif, shared helpers); N parallel per-scene calls each build ONE scene
// given that header as context; a deterministic stitcher (stitchLessonCode)
// assembles header + scenes + a <Series> wrapper from known metadata — the
// model never transcribes durations or audio URLs on the lesson path. Blast
// radius of a syntax slip: one ~4KB scene, not a whole lesson.
//
// Because reasoning is OFF (see provider comments), the prompts force all
// planning into VISIBLE output: the mandatory MECHANISM/FINGERPRINT/CAST/
// PACING/LAYOUT/COLLISION comment block at the top of each scene function.
// A check that isn't written down does not happen on a non-reasoning call —
// this is the core design principle of both prompts below.
//
// Crash-safety rules (interpolate shape, clamp, spring fps, undefined guards,
// forbidden imports) are real runtime constraints of the browser sandbox,
// not compensations for model weakness — never soften them.

const HEADER_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "i" (from "import"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer. You are building the SHARED FOUNDATION for an educational lesson — imports, a palette, a recurring motif, and reusable helper components — that every scene of this lesson will paste-reference by exact name. You do NOT write any scene's content, and you do NOT write the <Series> wrapper that plays the scenes — those come later, built by other code.

════════ PLAN BEFORE YOU CODE (do this in your head, do NOT write it as prose) ════════

LESSON VISUAL IDENTITY (decide ONCE, it must serve EVERY scene of this lesson):
Every scene in this lesson must feel like part of the SAME designed piece, not unrelated clips. Before any code, fix:
  • PALETTE: 3-4 colors derived from the SUBJECT, not a default. Biology→living greens; electronics→copper/PCB-green; finance→ink+ledger tones; astronomy→deep space + stellar accents; history→parchment/sepia; chemistry→lab-glass teals with reagent accents; economics→newsprint neutrals with one signal color. One background base, one primary accent (the "hero" color), one or two supporting hues — AND one dedicated TEXT color guaranteed high-contrast against the background base (near-white on dark bases, near-black on light bases). Declare ALL of these as named consts (e.g. inside a PALETTE object with a .text key) every scene will reuse — scenes must never have to guess what color makes text readable.
  • MOTIF: one recurring visual element or geometry that threads through the lesson (a grid, a flowing current, orbital paths, a timeline spine, cells, layers). Build it as a reusable helper component so scenes can each evolve it, not copy-paste it. It MUST be in continuous motion (a slow gradient drift, a pulsing hue, a gently shifting pattern — see the Backdrop example below) — a static motif gives every scene a dead base layer underneath whatever it builds on top, which defeats the point of building one. The motif's OWN geometry should also echo the subject where possible (a biology lesson's motif can be cell-membrane curves, not just a generic gradient) — the motif is the single biggest lever for the lesson NOT looking like every other lesson.
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
  • The palette + motif consts/components described above, named clearly (e.g. PALETTE with a .text key, Backdrop, Motif) so scenes can reference them without guessing.
  • The ZONES const from S5 — every scene relies on these exact numbers to avoid stacking text on text or letting a diagram creep into the text bands.
  • Any other TRULY shared utility worth extracting once (e.g. a Label component, a Panel/frame component) — only if more than one scene would plausibly need it. Do not invent scene-specific content; you have not been told what any individual scene shows.
  • EVERY visual component you declare MUST be SELF-CONTAINED — HARD RULE, mechanically rejected: its return root is either plain HTML (<div>/<AbsoluteFill>) or its OWN <svg> element (position:"absolute", left:0, top:0, width:1920, height:1080, pointerEvents:"none", overflow:"visible") with the shapes inside. NEVER return a bare <g>/<circle>/<rect>/<line>/<path>/<text> fragment: scenes will drop your components straight into <div> trees, and an SVG fragment outside <svg> renders NOTHING — no crash, no warning, the shape just silently doesn't exist, and the whole lesson ships with invisible graphics. A full-frame absolutely-positioned <svg> root costs nothing and works wherever the scene puts it.
  • If this lesson's subject involves direction, vectors, forces, or angles (physics, math, engineering, navigation) — build shared Arrow({from,to,...}) and AngleArc({vertex,...}) helpers here using the exact atan2-based math described in the scene rules' §C2, so every scene reuses the SAME correct direction/angle geometry instead of each one re-deriving it independently.
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
• PALETTE includes a dedicated high-contrast text color scenes can use without guessing.
• Every style key camelCase; no class=/for=; backtick count even; no bare braces in JSX text; every content-wrapper renders {children}.

Begin with imports, then CLAMP / FRAME / SAFE / clampPos / ZONES, then your palette consts, then your shared helper components. Your entire response is the code file, first characters "import", no text or fences around it.
`;

// ── GLM-specific header prompt ───────────────────────────────────────────────
// One short, XML-tagged reminder of the judgment call a smaller model is
// likeliest to let slide over a long prompt. Crash-safety rules are inherited
// verbatim via HEADER_CODE_GEN_RULES.
const GLM_HEADER_COHERENCE_GATE = `<coherence_gate priority="critical">
Before writing anything, lock the lesson's VISUAL IDENTITY: one subject-derived palette (3-4 colors + a guaranteed-contrast text color) + one recurring motif whose geometry echoes the subject, as concrete named consts/components. Every scene of this lesson will use ONLY what you write here — under-deciding here (a generic default palette, a motif too thin to reuse) is the single biggest risk to the course looking coherent AND the single biggest cause of every lesson looking the same.
</coherence_gate>
`;

const GLM_HEADER_CODE_GEN_RULES = GLM_HEADER_COHERENCE_GATE + HEADER_CODE_GEN_RULES;

function selectHeaderSystemPrompt(provider) {
  return provider.model.startsWith("glm") ? GLM_HEADER_CODE_GEN_RULES : HEADER_CODE_GEN_RULES;
}

// ═══════════════════════════════════════════════════════════════════════════
const SCENE_CODE_GEN_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "f" (from "function"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer. You build educational animations that a real studio would be proud of: purposeful, cinematic, and — above all — a clear visual explanation of ONE specific concept. Runs-without-crashing and stays-in-frame are the floor, not the goal. The goal is that a viewer who muted the audio would still understand the concept from the motion alone.

⚠️ THE #1 WAY THIS FAILS: a frame full of labels, numbers, letters and checkmarks sitting in fixed spots — a slide, not an animation. Every single element you place must carry its OWN motion tied to frame (an entrance, a state change, a position that tracks a live value) — nothing gets to just appear and sit still for the rest of the scene. This is graded mechanically in FINAL PASS below.

⚠️ THE #2 WAY THIS FAILS: a technically-correct scene that could belong to ANY topic — generic glowing circles and drifting particles with the topic's words pasted on. The FINGERPRINT line in your plan comment (below) exists to kill this: every scene must contain at least one visual that could ONLY exist in a lesson about THIS subject.

You are writing ONE SCENE of a larger lesson. The HEADER CODE below (already generated) has the lesson's imports, palette, and shared helper components already declared and in scope — reference those exact names; never redeclare, reimport, or rename them, and never invent a different palette.

════════ PLAN BEFORE YOU CODE — WRITE IT DOWN, THIS IS NOT OPTIONAL ════════

You are running with thinking/reasoning OFF for this call — there is no hidden scratchpad where "figuring it out first" can happen. If you skip straight to JSX, you WILL default to the labeled-picture failure above, because the mechanism/pacing/layout decisions never actually got made anywhere. The only fix is to make the plan part of your visible output: the FIRST thing inside your function body, before any JSX, is a comment block in exactly this shape (this counts as your first "f"-from-"function" output — the comment lives inside the function, not before it):

  function SceneN() {
    // MECHANISM: <state at frame 0> -> <state at end>, and what visibly drives that change — this is GIVEN to you below as mechanism.before / mechanism.after / mechanism.driver; transcribe it, then build exactly it. The driver is the thing the viewer literally watches happen; if your JSX doesn't render the driver in motion, the scene is wrong no matter what else it shows.
    // FINGERPRINT: <2 visual signatures unique to THIS subject — imagery that could not appear in a lesson on any other topic. At least ONE must be a rendered CAST member below, not just an idea. "Glowing circle" / "particles" / "arrows" are NOT fingerprints; "a plasmid ring opening at its restriction site" is.>
    // CAST: <element> [<its own animated property>], <element> [<its own animated property>], ... — every element listed here must reappear below wired to an interpolate/spring that reads frame
    // PACING: frame <a>: <what appears/changes>; frame <b>: ...; frame <c>: ...; frame <d>: ... (4 literal frame numbers spread across THIS scene's FULL duration; the LAST one must be ≥ 70% of durationInFrames — e.g. for 450 frames, ≥ 315)
    // LAYOUT: <anchor> = {x, y} computed once; <dependents> read the same anchor
    // CONTAINMENT: <child> INSIDE <parent>: parent center (x,y) r=<R> (or w×h) → child bound: |child - center| ≤ <R - childHalf - margin>; ... — one clause per pair given in the scene's spatial field, WITH the derived numeric bound the child's position formula actually uses (including any sin/cos amplitude: base ± amp must stay inside the bound). "none" only if the spatial field says none. A child positioned from hand-guessed coordinates instead of the parent's own geometry consts is how DNA ends up floating outside the cell — the #1 factual-wrongness failure.
    // COLLISION @ start/mid/end: <elemA>(x,y,±halfW,±halfH) vs <elemB>(...): gap OK; ... — list EVERY pair of major elements that are simultaneously visible at each of the 3 checkpoints, with real numbers. If any pair's boxes touch, fix the anchors or stagger the entrances NOW, in this comment, before any JSX exists.
    const frame = useCurrentFrame();
    ...
  }

Then work out the four things that comment answers, and build straight to them:
  (1) THE MECHANISM: given to you as structured before/after/driver — the scene's contract, not a suggestion. Stage it with the recipe for this scene's visualType (below), shown per CRAFT §A.
  (2) THE CAST: the specific elements the concept actually needs — sized to the concept, NOT to a quota. A clean idea shown with 4 well-chosen, well-animated elements beats 40 decorative ones. Add ambient/background motion only where it supports the mood; never as filler. A "cast member" with no animated property of its own does not belong in this list — either give it one or cut it.
  (3) THE PACING: 3-5 staged reveals spread across the FULL duration, tracking the narration (see CRAFT §B).
  (4) THE LAYOUT: shared position anchors so connectors/labels/contents line up, every final position clamped to SAFE (see CRAFT §C, and SAFETY §5), and every element placed in its correct ZONES band so nothing overlaps (see CRAFT §D). The COLLISION line is where this gets verified with numbers — a collision check that exists only as an intention is a check that never ran.

════════ VISUALTYPE STAGING RECIPE (structure, not content — your CAST is still subject-specific) ════════
{{VISUALTYPE_RECIPE}}

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
Y6. SVG elements ONLY render inside an <svg> tag — mechanically rejected otherwise. A <circle>/<rect>/<line>/<path>/<text>/<g>/<polygon> placed directly under a <div> or <AbsoluteFill> renders NOTHING (no crash, no warning — the shape silently doesn't exist). Every SVG primitive you write must sit inside an <svg style={{position:"absolute",left:0,top:0,width:1920,height:1080,pointerEvents:"none",overflow:"visible"}}> block, and any local helper that returns SVG shapes must either include that <svg> root itself or only ever be used inside one. The header's shared components are already self-contained — you can place THOSE anywhere.

§A — ILLUSTRATE THE MECHANISM, NOT A LABELED PICTURE. The single most common failure is a static shape with a name on it instead of the actual process happening. Show the BEFORE state becoming the AFTER state across the scene:
   • DNA replication → base pairs actually SEPARATING one by one, new bases animating in to pair with each exposed strand — not two lines labeled 5'/3'.
   • Cell division → for each phase, the real structures move: chromosomes condense and line up, spindle fibers extend, the membrane pinches — not a wheel with phase names spinning.
   • Enzyme activity → the enzyme shape travels ALONG the substrate with a visible change at the contact point — not a static blob labeled "enzyme".
   • Sorting → elements actually swap into order; binary search → the search window actually narrows.
   Test: paused at start / middle / end, does the frame look MEANINGFULLY different, reflecting real progress? If it's the same picture with a title fading in, it FAILS — no amount of background decoration rescues it.
   CONTRASTIVE EXAMPLE — the exact difference between rejected and accepted:
     BAD (static legend — REJECTED): conclusions parked on screen from frame 0, nothing drives them:
       <div>A ✓</div> <div>B ✓</div> <div>C ✓</div>
       <div>✕ negative weights break this</div>   {/* asserted in text, never shown happening */}
     GOOD (algorithm running — the SAME step variable drives the graph AND its annotations):
       const step = Math.floor(interpolate(frame, [30, 380], [0, 5], CLAMP));
       {nodes.map((n, i) => <Node key={i} x={nodeX(i)} y={nodeY(i)} state={i < step ? "final" : i === step ? "active" : "pending"} />)}
       {nodes.map((n, i) => i < step ? <Check key={"c"+i} x={nodeX(i)} y={nodeY(i)} appear={frame - (30 + i * 70)} /> : null)}
     In GOOD, a checkmark appears the FRAME its node finalizes, because both read the same step — the motion literally IS the explanation. In BAD, the checkmarks are wallpaper.
   NAMED FAILURE — "THE STATIC LEGEND": a graph/algorithm scene that renders node letters with a checkmark parked next to each ("A✓ B✓ C✓ D✓") plus a static "✕ this fails / ✓ use that instead" caption, and nothing else ever moves, is EXACTLY the BAD case above — a slide of conclusions, not an animation of the algorithm reaching them. The fix is never a fancier layout; it's the ALGORITHM ITSELF running on screen, and any failure case shown as a SEPARATE staged beat where the wrong result visibly happens and then has to change — failures are demonstrated, not asserted in a caption.
   NOTHING GETS NAMED WITHOUT BEING DRAWN: any text, label, arrow, or caption that references a specific thing (a node, a value, a comparison, a state, a target) is a PROMISE that thing is actually rendered and animated on screen at that moment. A caption saying "negative weights break this" with no edge/weight ever shown; a label naming a value that's never drawn as a shape; an arrow aimed at a spot with nothing there — all the SAME bug: text describing content that got planned but never built. Treat every noun in your own onScreenText/visualDescription/captions as a checklist — before you finish, confirm each one exists as a real element in your CAST with its own motion (§C's anchor-reuse rule already forces this for arrows; apply the same logic to every other reference). If you can't fit something you're about to name, cut the reference instead of leaving it ungrounded — an unlabeled visual beats a label pointing at nothing.
   INFORMATION BUDGET IS A HARD CAP, NOT A STYLE PREFERENCE: at most 2-3 small supporting labels visible on the diagram at any SINGLE frame, on top of the title/caption. Never label every element at once (a value AND a state AND a coordinate on each of 6 nodes = 18 competing text items is a FAIL, even with zero overlap) — pick only what matters for THIS instant, and stage the rest in with the pacing (§B). When in doubt, cut a label — the motion carries the meaning; text only confirms the one or two things that matter right now.

§A2 — GIVE IT DEPTH: AMBIENCE + GLOW + A SECONDARY MOTION, ON TOP OF THE MECHANISM. §A is the scene's SUBSTANCE; this is its FINISH — a scene that nails §A but skips this reads as a correct wireframe, not a finished piece. This is NOT a quota on element count — §A's "sized to the concept" still governs how many things you draw. It's about how the things you already decided to draw are finished:
   • AMBIENCE: render the header's Backdrop/motif (it's already continuously moving) as your base layer, BEHIND the cast. If the motif isn't a full-screen wash, add one small ambient touch of your own (a couple of slow-drifting, low-opacity shapes; a faint moving gradient) — low z-index, low opacity, mood only, never competing with §A's overlap/information-budget rules.
   • GLOW: the CAST's PRIMARY elements (not incidental ambience) get a boxShadow or filter: drop-shadow(...) in the header's palette — this is what separates a finished shape from a flat div.
   • SECONDARY MOTION: at least one element whose motion echoes or orbits a primary element (a small satellite dot circling the main shape, a fading trail behind something moving, a subtle counter-rotation) where the concept plausibly supports it — the one thing that reads as "alive" beyond the mechanism's own required motion.

§B — MOTION IS CONTINUOUS BUT MOTIVATED.
   • No frozen frames: something is always in gentle motion (Math.sin(frame/k) breathing, drift, the mechanism progressing). But motion must MEAN something — it illustrates the concept or sets the mood. Avoid restless decorative jitter that has nothing to do with the topic; that is precisely what makes an animation read as generated filler.
   • Pace across the FULL duration — HARD RULE: the final staged reveal's literal start frame must be ≥ 70% of durationInFrames (for a 450-frame scene: ≥ 315; the PACING comment line must show this). A scene fully built by frame 60 that merely wobbles for the remaining 390 FAILS: the viewer watches nothing new while the narrator keeps talking. Break content into 3-5 stages and stagger their reveals across the whole timeline (for 450 frames, roughly 0 / 90 / 210 / 330 as literals), with the mechanism visibly advancing between reveals.
   • Entrances feel intentional: use spring() for a couple of key elements so they arrive with weight; give elements with continuous motion DIFFERENT sin/cos periods and phases so nothing moves in robotic lockstep.

§C — SPATIAL COHERENCE. Elements that relate must share ONE source of truth for position — this is the #1 cause of a scene that runs but looks WRONG (an arrow pointing at nothing, a label drifting off its target, particles spilling out of a beaker).
   • Compute each anchor ONCE into a named const; every dependent element (connector endpoint, label, contained particle) READS that same const. Never type a related coordinate twice.
     const enzyme = { x: 700, y: 540 };
     <line x1={enzyme.x} y1={enzyme.y} ... />   // reuse — do not re-type 720/560
   • Moving target: compute the live animated position once; the element AND its arrow/label both read it, so they track together every frame.
   • Containment: derive a container's inner region from the SAME geometry you drew the container with, and clamp contents into it — never guess "inside" coordinates independently. The pattern is always: parent geometry as consts FIRST, children derived from them:
       const cell = { x: 960, y: 540, r: 320 };            // parent drawn from these exact consts
       const nucleus = { x: cell.x, y: cell.y, r: cell.r * 0.45 };   // child radius/position DERIVED, never retyped
       // any element inside nucleus: distance from nucleus center ≤ nucleus.r - elemHalf - 10
       const dnaX = nucleus.x + Math.cos(frame / 20) * (nucleus.r - 40);  // amplitude bounded by parent, so it CANNOT exit
     An animated child's FULL range must stay inside (base ± sin/cos amplitude, spring overshoot included) — clamp the amplitude to the parent's inner radius, don't just clamp the resting position. Every pair in your CONTAINMENT plan line must be built this way.
   • Proportion: the main diagram dominates (~40-60% of frame width) in ZONES.diagram; labels are subordinate to what they label; contained items are a small fraction of their container; clamp any animated size to a sane range (a radius formula that can hit 0 or 900 is a bug).
   • NO SHAPE-ON-SHAPE OVERLAP IS A MECHANICAL CHECK, NOT A JUDGMENT CALL — AND ITS OUTPUT IS THE COLLISION COMMENT LINE: for each pair of elements simultaneously visible (opacity > 0) at each of the 3 checkpoints (start / the mid-pacing stage from §B / end), their centers must be farther apart than the sum of their half-widths — no two bounding boxes intersect. You do this check by WRITING the numbers in the COLLISION line of your plan comment; a check with no written numbers behind it did not happen. If two elements are close, either increase the gap between their anchor coordinates or stagger their entrances (§B) so they're never both fully opaque at the same frame.
   • NO ARROW POINTS AT NOTHING IS ALSO A MECHANICAL CHECK: every Arrow's "to" (and "from") target must be a named anchor that's read a SECOND time by whatever it actually points at (e.g. the same target const also sets a rendered element's left/top/cx/cy) — never an anchor invented only for the arrow itself. This is enforced automatically: an anchor referenced nowhere except inside the Arrow call gets REJECTED and this scene is regenerated, so an omitted target isn't a style slip, it's a build failure. If you draw an Arrow, render the thing at its far end FIRST, from the same const, then point the Arrow at it.

§C2 — ARROWS, VECTORS & ANGLES. Wrong arrow direction and wrong angle arcs are almost always the SAME root cause as §C: the angle/sweep was hand-guessed or hand-typed instead of computed from the same coordinates that drew the thing it points at. Never hardcode a rotation degree, never eyeball an arrowhead's orientation.
   • DIRECTION IS ALWAYS atan2, NEVER GUESSED: for an arrow/vector from a point "from" to a point "to", the correct angle is:
       const dx = to.x - from.x, dy = to.y - from.y;
       const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
     This works with ZERO extra sign flip or "y-axis correction" — screen/SVG coordinates already have y increasing downward, and both Math.atan2(dy,dx) and CSS/SVG rotate() treat positive degrees as CLOCKWISE in that same coordinate space, so they agree automatically. Do NOT negate angleDeg and do NOT swap dx/dy "to fix the direction" — if an arrow points wrong, the bug is almost always a stale/wrong (from, to) pair, not the rotation formula.
   • ARROWHEAD PATTERN (nest inside your scene function): draw the shaft and head from the SAME from/to, so the head can never point a different way than the shaft:
       function Arrow({ from, to, color, width }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; width: number }) {
         const dx = to.x - from.x, dy = to.y - from.y;
         const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
         return (
           <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
             <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={width} />
             <g transform={"translate(" + to.x + "," + to.y + ") rotate(" + angleDeg + ")"}>
               <polygon points={"0,0 -18,-9 -18,9"} fill={color} />
             </g>
           </svg>
         );
       }
     The arrowhead polygon is authored pointing toward +x (angle 0) at the origin; rotating the whole <g> by angleDeg after translating to "to" is what aims it — never rotate the polygon's own point coordinates by hand. (If the header already declares a shared Arrow/AngleArc helper, use THAT — do not re-nest your own.)
   • A MOVING TARGET MEANS A MOVING ANGLE: if "to" (or "from") is animated, angleDeg MUST be recomputed from the SAME live from/to values every frame (read them from the §C anchor const, do not cache the angle from frame 0) — this is the vector-arrow version of "an arrow pointing at nothing".
   • ANGLE ARCS BETWEEN TWO RAYS (e.g. showing the angle at a vertex between two lines): compute each ray's angle with the SAME atan2 pattern from the vertex to a point on that ray — never type the angle as a literal degree guess:
       const angle1 = Math.atan2(rayEnd1.y - vertex.y, rayEnd1.x - vertex.x) * 180 / Math.PI;
       const angle2 = Math.atan2(rayEnd2.y - vertex.y, rayEnd2.x - vertex.x) * 180 / Math.PI;
       function AngleArc({ vertex, angle1, angle2, radius, color }: { vertex: { x: number; y: number }; angle1: number; angle2: number; radius: number; color: string }) {
         let delta = angle2 - angle1;
         delta = ((delta + 180) % 360 + 360) % 360 - 180; // normalize to (-180, 180] — the SHORT way around, matching the visible angle between the rays
         const sweep = delta >= 0 ? 1 : 0;
         const toRad = (d: number) => d * Math.PI / 180;
         const x1 = vertex.x + radius * Math.cos(toRad(angle1)), y1 = vertex.y + radius * Math.sin(toRad(angle1));
         const x2 = vertex.x + radius * Math.cos(toRad(angle1 + delta)), y2 = vertex.y + radius * Math.sin(toRad(angle1 + delta));
         const d = "M " + x1 + " " + y1 + " A " + radius + " " + radius + " 0 0 " + sweep + " " + x2 + " " + y2;
         return <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}><path d={d} stroke={color} strokeWidth={3} fill="none" /></svg>;
       }
     Put any angle-value label at the BISECTOR, not a guessed offset: labelAngleDeg = angle1 + delta / 2, positioned at vertex + (radius + 24) in that direction (same toRad/cos/sin as above) — never a hardcoded label offset that only happens to look right for one specific pair of angles.

§C3 — PROGRESSIVE CIRCLE / ARC REVEAL. A circle or arc that "draws itself" over time is a stroke-dasharray reveal, NOT a per-frame recomputed path — hand-recomputing an SVG arc's "A" command every frame is the #1 source of a progressive circle that looks subtly WRONG (starts from the wrong point, seems to draw backward, or suddenly jumps partway through), because it requires a large-arc-flag that must flip from 0 to 1 exactly when the swept angle crosses 180° and that flip is easy to get backwards or forget.
   • DEFAULT TO THIS PATTERN for any circle/ring that fills in over time (progress bars, orbit traces, a ring closing around a target):
       const r = 140;
       const circumference = 2 * Math.PI * r;
       const progress = interpolate(frame, [30, 150], [0, 1], CLAMP); // 0 = empty, 1 = fully drawn
       <circle
         cx={center.x} cy={center.y} r={r} fill="none" stroke={color} strokeWidth={6}
         strokeDasharray={circumference}
         strokeDashoffset={circumference * (1 - progress)}
         transform={"rotate(-90 " + center.x + " " + center.y + ")"}
         strokeLinecap="round"
       />
     Two details are EXACTLY what makes this "feel off" when skipped — both are silent, no-crash bugs, so they must be gotten right by construction, not caught by testing:
       - transform="rotate(-90 cx cy)" is REQUIRED: an SVG <circle>'s stroke path always starts at its rightmost point (3 o'clock / angle 0) and draws CLOCKWISE from there. Without this rotation the circle visibly starts drawing from 3 o'clock instead of the top (12 o'clock) — reads as "wrong" even though every number is technically correct.
       - strokeDashoffset MUST be circumference * (1 - progress), never circumference * progress. Dashoffset shifts the dash pattern BACKWARD along the path, so it has to SHRINK as progress grows (progress=0 → offset=circumference, fully hidden; progress=1 → offset=0, fully revealed). Inverting this makes the circle appear to erase itself, or start fully drawn and vanish, instead of drawing in.
   • ONLY use a hand-built path "A" arc (as in AngleArc, §C2) when you need a FIXED start/end angle that isn't a simple 0→1 fill (e.g. always show just the top-right quarter) — and even then, derive both angles from atan2 per §C2, never from a growing "progress" value multiplied into a degree count by hand.

§D — READABLE TEXT LAYER. Use the header's ZONES for every text block: titles live in ZONES.title, captions in ZONES.caption (e.g. position with top: ZONES.title.yMin or top: ZONES.caption.yMin), and keep the diagram — including its full motion range, clamped per S5 — entirely inside ZONES.diagram; never let a clamped diagram position cross into ZONES.title or ZONES.caption. Use the header PALETTE's dedicated text color for titles/captions — never a hue close in luminance to the background. Give text a zIndex above the diagram plus a REAL textShadow (or an opaque/near-opaque backing panel) for contrast over any color — never skip this and never weaken it to a faint 1-2px wisp. Minimum: textShadow: "0 2px 20px rgba(0,0,0,0.9)" (or equivalent strength) on every single title/caption, no exceptions. Text with no shadow/backing whose color is close in luminance to the background behind it is UNREADABLE — the SAME class of failure as a caption naming something never drawn (§A): the words exist in the code but not for the viewer. Body ≥28px, titles ≥36px.
   NON-OVERLAP IS MECHANICAL, NOT A JUDGMENT CALL: if two text blocks occupy the SAME zone one after another (e.g. two captions), the second block's fade-in START frame must be a LITERAL number that is ≥ the first block's fade-out END frame — compute both as adjacent literals together, e.g. first caption fades out over [140, 170], second caption fades in starting at exactly 170 (not 150, not "whenever it looks right"). Never write two interpolate() calls for the same zone whose opacity ranges can both be > 0 at the same frame.
   TOTAL READABLE-TEXT CAP: count every simultaneously-visible text item across ALL zones at any single frame — title + caption + diagram labels combined. Keep that count to roughly 4-5 at most. A frame that's technically non-overlapping but crammed with 10 small labels still reads as cluttered and confusing — the same INFORMATION BUDGET from §A applies to the whole frame, not just the diagram.
   BINDING SPEC: you are given this scene's visualDescription (implement the specific elements/actions it names — not a different visual you'd prefer) and onScreenText (render VERBATIM as the scene's primary text — never paraphrase or replace it).

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
  // MECHANISM: full 12-cell window at frame 0 -> single found cell by the end; each step halves the highlighted window
  // FINGERPRINT: a sorted numeric array with a live shrinking search window; a midpoint pointer that hops cell-to-cell — imagery specific to search, not reusable wallpaper
  // CAST: cells [state color/glow per step], pointer [x hops with spring drop], satellite dot [orbit], title [fade in], found caption [fade in late]
  // PACING: frame 20: window full; frame 90: first halving; frame 210: second; frame 300: found state; frame 320: caption (320 ≥ 0.7*450=315 ✓)
  // LAYOUT: rowY/startX/gap computed once; cellX(i) is the ONLY x source — cells, pointer, check states all read it
  // CONTAINMENT: none — no element of this concept lives inside another (satellite dot orbits the pointer but reads pointerX/rowY, radius 26 ≪ any neighbor gap). Scenes WITH containment (organelles in a cell, electrons in shells) list each pair here with the parent-derived bound.
  // COLLISION @ start/mid/end: cells are gap-118 apart at halfW 44 (74px clearance, OK); pointer sits 110px above rowY (outside cell boxes, OK); title y=120-220 vs rowY=520 (OK); caption y=860+ (OK)
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
  const foundOpacity = interpolate(frame, [320, 360], [0, 1], CLAMP);

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
      {/* Secondary motion (§A2): a small satellite dot orbiting the pointer tip — reads the SAME pointerX/rowY anchor the pointer itself uses (§C), never an invented position */}
      <div style={{
        position: "absolute",
        left: clampPos(pointerX + Math.cos(frame / 14) * 26, SAFE.xMin, SAFE.xMax) - 5,
        top: clampPos(rowY - 110 + Math.sin(frame / 14) * 26, SAFE.yMin, SAFE.yMax) - 5,
        width: 10, height: 10, borderRadius: "50%",
        backgroundColor: "#f5b642", boxShadow: "0 0 12px #f5b64299", opacity: 0.8,
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

Notice: the plan comment is written FIRST with real numbers in COLLISION and a PACING line whose last stage clears the 70% bar; the window NARROWS across the whole duration (staged progress, §B); the pointer reads the SAME geometry as the cells so it always lands on one (§C); highlight state is DRIVEN by the algorithm so the motion literally teaches it (§A); the FINGERPRINT names imagery only a search lesson could contain; every position is clamped (S5); the title and caption sit in two DIFFERENT ZONES (§D); the interpolate ranges are literals (S1); spring gets fps (S2); the index lookup is guarded (S4); and Cell is nested INSIDE the scene function. Also §A2: Backdrop as base layer, glow on primary cells, and the orbiting satellite dot as secondary motion — all reusing existing anchors. Reproduce these HABITS on a totally different visual built from your own concept and the header's palette.

════════ FINAL PASS (verify silently, fix before returning) ════════
• EXACTLY one top-level declaration (your scene function, correctly named), no import, no export, no <Series>/<Series.Sequence>/<Audio>.
• Your leading plan comment is present with ALL SEVEN lines (MECHANISM / FINGERPRINT / CAST / PACING / LAYOUT / CONTAINMENT / COLLISION), and every element named under CAST has a MATCHING interpolate/spring in the JSX below that reads frame — an element that's declared, positioned and rendered but never appears in an interpolate/spring call is a static prop, not an animation, and is a FAIL by itself even if nothing else is wrong.
• CONTAINMENT FIDELITY: every pair in the scene's given spatial field appears in your CONTAINMENT line with a real numeric bound, AND the child's position formula in the JSX literally derives from the parent's geometry consts (reads parent.x/parent.r etc.) with its full animated range (base ± amplitude) inside that bound. A child whose coordinates are hand-typed numbers unrelated to the parent's consts is a FAIL even if it happens to look inside at frame 0 — it WILL drift out.
• MECHANISM FIDELITY: your MECHANISM line matches the given mechanism.before/after/driver, the JSX renders the DRIVER itself in motion (not just its end result), the frame-0 state matches "before", and the final-frame state matches "after". A scene that skips the driver and cross-fades before into after is a slide transition, not the mechanism — FAIL.
• RECIPE CHECK: the scene follows its visualType's staging recipe (intro builds, steps has a spine with one dominant step, comparison diverges from a shared input, summary replays compressed — see VISUALTYPE STAGING RECIPES).
• FINGERPRINT CHECK: at least one CAST member is topic-unique imagery per the FINGERPRINT line — if every element in this scene could be dropped unchanged into a lesson on a different subject, the scene is generic wallpaper and FAILS.
• COLLISION line has REAL NUMBERS for every simultaneously-visible major pair at start/mid/end, and no pair's boxes intersect — the check exists in writing, not just in intent.
• PACING line's last literal is ≥ 70% of durationInFrames, and the matching interpolate() literals in the JSX agree with it.
• RE-READ your own onScreenText/visualDescription/captions one more time and go down every specific thing they name (a node, a value, a comparison, a target) — each one must have a real, animated element behind it somewhere in the JSX. Anything named that isn't actually drawn is a FAIL (§A) — cut the reference or build the element, don't ship the gap.
• No useState / staticFile / non-remotion,react imports (there should be NO imports at all).
• Every interpolate: 3 args, literal number arrays, strictly-increasing inputRange. Every spring has fps. Every final position clamped to SAFE (S5). Every arr[i+1]/find()/lookup guarded (S4).
• Every style key camelCase; no class=/for=; backtick count even; no bare braces in JSX text; every content-wrapper renders {children}.
• Motion on every frame but motivated (§B); the mechanism visibly progresses start→end (§A); related elements share one anchor (§C).
• ANY arrow/vector direction and any angle-arc sweep is COMPUTED via Math.atan2 from live from/to/vertex coordinates (§C2) — not a hardcoded rotation degree, not hand-guessed, and recomputed every frame if its endpoints move.
• ANY progressively-drawn circle/ring uses the strokeDasharray/strokeDashoffset pattern with rotate(-90 cx cy) and offset = circumference * (1 - progress) (§C3) — not a hand-recomputed arc path.
• Every text block sits in its ZONES band (title/diagram/caption never cross into each other, §D); onScreenText rendered verbatim, legible; any two text blocks sharing a zone have adjacent, non-overlapping fade frames, never both opacity > 0 at once.
• TEXT CONTRAST CHECK (§D): every title/caption uses the header PALETTE's text color AND has a real, strong textShadow (dark, e.g. rgba(0,0,0,0.8-0.9) at real blur/spread — not a faint 1-2px wisp) or an opaque/near-opaque backing panel behind it. Text with no shadow/backing sitting directly on the motif/diagram background is a FAIL exactly like an unlabeled arrow (§A) — the words are in the code but invisible to the viewer.
• COUNT your simultaneously-visible text items at the busiest frame (title + caption + diagram labels) — if it's above ~4-5, cut labels or stage them across the timeline instead (§A, §D). A crowded frame is a FAIL even with zero overlap.
• Uses the header's palette/motif/ZONES — does not invent new ones.
• DEPTH CHECK (§A2): header's Backdrop/motif (or an ambient touch of your own) rendered behind the cast; PRIMARY cast elements have a boxShadow/drop-shadow glow; at least one element has a secondary motion (orbit/trail/echo) beyond the mechanism's own required movement.

Your entire response is the scene's code, first characters "function", no text or fences around it.
`;

// ── GLM-specific scene prompt ────────────────────────────────────────────────
const GLM_SCENE_COHERENCE_GATE = `<coherence_gate priority="critical">
Use the HEADER CODE's palette/motif exactly as given — do not invent new colors. For THIS scene, decide the MECHANISM (before→after) and a cast of elements sized to that concept, not a fixed quota of decorative particles — then write the seven-line plan comment (MECHANISM/FINGERPRINT/CAST/PACING/LAYOUT/CONTAINMENT/COLLISION) BEFORE any JSX; skipping it is how every failure below happens. The failures to avoid are three different faces of the same laziness: a static labeled picture with no real progress, a generic particle-field indistinguishable across unrelated topics, and a frame where two elements or two captions sit on top of each other because no one wrote the collision numbers down. Aim for a scene that teaches the concept through its motion, contains at least one visual only THIS subject could produce, and clearly belongs to THIS lesson.
</coherence_gate>
`;

const GLM_SCENE_CODE_GEN_RULES = GLM_SCENE_COHERENCE_GATE + SCENE_CODE_GEN_RULES;

// Each scene's scene-plan (sceneService.js) already assigns exactly ONE of
// these seven visualType values — so instead of showing every recipe on
// every call (six-sevenths of which are irrelevant to THIS scene), splice in
// only the matching one. Same content as before, just scoped to what this
// specific call actually needs.
const VISUALTYPE_RECIPES = {
  intro: "BUILD, don't announce: the lesson's central object assembles piece by piece as the title settles, ending fully formed. Never a title floating over ambience.",
  concept: "ONE core object transforming center-stage; the transformation IS the explanation. Supporting labels arrive only after the transformation is underway.",
  diagram: "structure assembles in dependency order (nodes before the connectors that join them; container before contents); each connector draws itself only after BOTH its endpoints exist on screen.",
  steps: "a visible spine (timeline/track/path) with step k activating while step k-1 visibly recedes (dims/shrinks); exactly one step is dominant at any frame; the spine shows progress position at all times.",
  comparison: "split layout, the SAME input enters both sides simultaneously, both sides animate in lockstep until the exact moment the difference matters, then visibly diverge; end holding the contrast side by side.",
  example: "real concrete values flow through the mechanism: show actual numbers/items changing state as they pass through, not an abstract re-run. The values on screen must be consistent with each other at every frame (if 3 moved out, 3 arrived).",
  summary: "a compressed replay: the lesson's key transformation re-runs fast (2-4x the original pacing) with the motif returning center stage; end on the AFTER state, held stable, as the lesson's final image.",
};

function visualTypeRecipeLine(visualType) {
  const recipe = VISUALTYPE_RECIPES[visualType];
  const body = recipe
    ? `  • ${visualType} — ${recipe}`
    : `  • (visualType "${visualType}" has no listed recipe — build straight from the MECHANISM/CAST/PACING/LAYOUT plan above.)`;
  return `Each scene declares a visualType; use its recipe as the scene's SKELETON. The recipe fixes the staging pattern that makes this type legible; the mechanism + fingerprint supply everything topic-specific. Never let the recipe override the given mechanism — if they conflict, the mechanism wins.
${body}`;
}

// Domain-specific technique guidance, injected ONLY for scenes whose
// scene-plan tagged a matching domainSkill (sceneService.js) — most scenes
// tag "none" and get nothing extra here. Unlike the recipes above, this is
// genuinely NEW guidance the base prompt doesn't otherwise give: the base
// prompt's CRAFT rules are deliberately generic (any topic, any visual), so
// technique-specific failure modes for charts/algorithms/code were
// previously uncovered. Missing/unrecognized domainSkill values are a safe
// no-op — the scene just gets the same prompt it always did.
const SCENE_DOMAIN_SKILLS = {
  "chart-data": `════════ SKILL: DATA CHARTS ════════
Scale every bar/point from ONE shared domain-to-range mapping computed once (e.g. const barHeight = (v) => interpolate(v, [0, maxValue], [0, 260], CLAMP)) — never hardcode a pixel height per data value by hand, and never let two elements derive their size from different formulas. Animate bars/points growing FROM the shared baseline, not fading in at full size. Axis labels/ticks must read from the SAME array driving the shapes (map over the data once for both), never be retyped as separate strings that could drift out of sync with the actual values.`,
  "algorithm-trace": `════════ SKILL: ALGORITHM TRACE ════════
Maintain exactly ONE \`step\` (or equivalent progress) value derived from frame via interpolate — every visual signal of algorithm state (which element is active/compared/sorted, where a pointer sits, which edges are visited) must read that SAME step value, never a separately-timed interpolate. Two elements that are supposed to be in sync but derive their state from different frame ranges is the #1 way an algorithm trace looks wrong even when each piece animates fine on its own.`,
  "code-snippet": `════════ SKILL: CODE DISPLAY ════════
Render code as individual tokens (words/operators/strings split into separate <span>s) with per-token or per-line opacity/color interpolate for reveal and highlighting — never a single block of text that just fades in all at once. If showing execution, highlight the CURRENTLY EXECUTING line/token by reading the same step/frame value driving any accompanying state visualization (§C's shared-anchor rule applies here too), so the highlighted line and the visualized state never disagree about what's happening right now.`,
  "equation-math": `════════ SKILL: MATH NOTATION & GRAPHS ════════
For a plotted function, compute points from the ACTUAL formula over a fixed domain (never hand-place points to "look like" the curve). When a term or value changes, show the specific number/symbol that changes — updating it in place — rather than replacing the whole equation. Axes and gridlines are drawn ONCE from the same coordinate mapping every plotted point uses, so the curve is always correctly positioned relative to them.`,
  "physical-system": `════════ SKILL: PHYSICAL SYSTEMS (forces/waves/circuits/molecules) ════════
The quantity that DRIVES the physics (force, voltage, wave phase, concentration) should be ONE value computed from frame, with every dependent visual (position, amplitude, color intensity, particle motion) reading that same driving value — not independently-timed animations that happen to look physics-like. Real systems have continuous motion (oscillation, flow, vibration) even during "held" states — avoid frozen intermediate poses; something is always moving in response to the driving value.`,
};

function selectSceneSystemPrompt(provider, visualType, domainSkill) {
  const base = provider.model.startsWith("glm") ? GLM_SCENE_CODE_GEN_RULES : SCENE_CODE_GEN_RULES;
  const withRecipe = base.replace("{{VISUALTYPE_RECIPE}}", visualTypeRecipeLine(visualType));
  const skill = SCENE_DOMAIN_SKILLS[domainSkill];
  return skill ? `${withRecipe}\n\n${skill}` : withRecipe;
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

// Ordered so everything IDENTICAL across a lesson's 8-14 scene calls (the
// lesson line + header code block) comes FIRST and everything that varies per
// scene comes LAST — together with the system prompt this forms the longest
// possible shared prefix across those calls, which is what automatic prefix
// caching keys off of (a cache hit requires the prefix to match from the very
// start of the request). Do not reorder this without re-checking cache-hit
// tokens in the [scene] usage logs.
function buildSceneUserContent(lesson, scene, index, totalScenes, headerCode, componentName) {
  const sceneName = sceneComponentName(index);
  // Structured mechanism from the scene plan (before/after/driver) — the
  // scene's binding contract. Older plans (and any degraded plan that slipped
  // through) may lack it; fall back to an instruction to derive it from the
  // visualDescription rather than emitting "undefined" into the prompt.
  const m = scene.mechanism;
  const mechanismBlock =
    m && m.before && m.after && m.driver
      ? `mechanism.before (state at frame 0): ${m.before}
mechanism.after (state at the final frame): ${m.after}
mechanism.driver (the visible action the viewer watches transform before into after): ${m.driver}`
      : `mechanism: not provided — derive before/after/driver from the visualDescription and write them into your MECHANISM plan line before any JSX.`;
  return `
LESSON: ${lesson.title} (component ${componentName})

HEADER CODE (already imported/declared — reference these exact names, do not redeclare or reimport):
\`\`\`tsx
${headerCode}
\`\`\`

SCENE ${index + 1} of ${totalScenes}
YOUR FUNCTION NAME (use exactly this): ${sceneName}
durationInFrames: ${scene.durationInFrames}
visualType: ${scene.visualType}
onScreenText: ${scene.onScreenText}
${mechanismBlock}
spatial (containment/attachment contract — every pair here MUST appear in your CONTAINMENT plan line with derived numeric bounds): ${scene.spatial || "not provided — derive any obvious parent/child pairs from the visualDescription (anything described as inside/within/on/attached to something else) and write them into your CONTAINMENT line; 'none' only if there genuinely are none."}
visualDescription: ${scene.visualDescription}

Write ONLY the function ${sceneName}, illustrating this scene's mechanism per the PLAN and CRAFT sections above — starting with the seven-line plan comment (MECHANISM / FINGERPRINT / CAST / PACING / LAYOUT / CONTAINMENT / COLLISION) as the first thing inside the function body. The MECHANISM line must transcribe the before/after/driver given above. The PACING line's last literal must be ≥ ${Math.floor(scene.durationInFrames * 0.7)} (70% of ${scene.durationInFrames}). No import, no export, no <Series>/<Series.Sequence>/<Audio>.
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
const HEADER_MAX_OUTPUT_TOKENS = 24000;
const SCENE_MAX_OUTPUT_TOKENS = 72000;

// ── Header generation ───────────────────────────────────────────────────────
async function generateLessonHeader(lesson, scenes, maxAttempts = 2) {
  const label = `header L${lesson.lessonNumber}`;
  const start = Date.now();

  return withRetries(label, maxAttempts, async ({ attempt, feedback }) => {
    console.log(`  [${label}] Attempt ${attempt}/${maxAttempts}...`);

    const { text, stopReason, usage } = await streamCodeCompletion({
      limiter: limitZaiCall,
      provider: HEADER_PROVIDER,
      systemPrompt: selectHeaderSystemPrompt(HEADER_PROVIDER),
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
  }, { keyEnv: HEADER_PROVIDER.keyEnv, stage: "header" });
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
      limiter: limitZaiSceneCall,
      provider: SCENE_CODE_PROVIDER,
      systemPrompt: selectSceneSystemPrompt(SCENE_CODE_PROVIDER, scene.visualType, scene.domainSkill),
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
  }, { keyEnv: SCENE_CODE_PROVIDER.keyEnv });
}

// ── Deterministic stitcher ──────────────────────────────────────────────────
// Non-LLM assembly: header + every scene's function component + a <Series>
// wrapper built directly from known scene metadata (durationInFrames,
// audioUrl) — never transcribed by the model, so a duration-sum drift or a
// mistyped audio URL is structurally impossible on the lesson path.
// `sceneIndices` (optional) gives each entry's REAL scene index for partial
// stitches (e.g. a single-scene preview of scene 3, whose LOCAL index is 0
// but whose component is "Scene4"). Defaults to local order — the normal
// full-lesson stitch.
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
// Retry topology (each layer confirmed live to matter — do not re-serialize):
//   • ALL scenes fire at once; real concurrency is bounded ONLY by the
//     limitZaiSceneCall semaphore, which rolls — the instant a slot frees,
//     the next queued scene takes it. (A previous fixed-size-group design
//     stalled every group on its own slowest member.)
//   • Each scene owns its FULL retry budget (SCENE_MAX_ATTEMPTS_PER_LESSON)
//     inside its own generateSceneCode call — no round barrier. (A previous
//     rounds design made a failed scene wait for the slowest sibling before
//     retrying: measured 191s of a 235s code stage from two scenes.)
//   • Per-scene progress notifications attach to EACH scene's own promise
//     via .then(), never to the awaited allSettled result — otherwise every
//     notification waits for the slowest scene overall (confirmed live:
//     60s+ notification delay).
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

  // Same total ceiling the old 2-attempts × 3-rounds design allowed, just no
  // longer serialized behind round barriers.
  const SCENE_MAX_ATTEMPTS_PER_LESSON = 6;

  // NEW: header reuse across outer attempts. The header and the scenes are
  // independent failure domains — when an outer attempt dies because scenes
  // (or the critic) failed, regenerating a header that already validated is
  // pure waste AND discards the visual identity the surviving prompt-cache
  // entries were built against. Policy:
  //   attempt 1           → caller's prefetched headerPromise (or fresh)
  //   middle attempts     → reuse the last validated header, UNLESS the
  //                         failure was header-stage
  //   final attempt       → always fresh (a truly clean reroll, in case the
  //                         header is subtly implicated in repeated scene
  //                         failures the stage tagging can't see)
  let reusableHeader = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  [code L${lesson.lessonNumber}] Outer attempt ${attempt}/${maxAttempts} for ${componentName} (header + ${scenePlan.length} scenes)...`);

      let header;
      if (attempt === 1 && headerPromise) {
        // Reuse a header generation the caller kicked off concurrently with
        // audio generation — header content only depends on scene
        // descriptions, never on measured audio durations, so the pre-audio
        // header is identical to a post-audio one.
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

      // Each scene ALSO waits on its own scenePromises[i] before starting
      // (the audio/code pipelining) — that wait doesn't consume a
      // limitZaiSceneCall slot (the semaphore only wraps the actual LLM call
      // inside generateSceneCode), so it never blocks a sibling that's ready
      // sooner. If a scene's audio permanently failed, scenePromises[i]
      // rejects and is caught below exactly like a code-generation content
      // error — ttsService tags that rejection with `.stage = "audio"` so
      // the eventual failure is correctly attributed.
      await Promise.allSettled(
        scenePlan.map((_, i) =>
          scenePromises[i].then((measuredScene) =>
            generateSceneCode(lesson, measuredScene, i, scenePlan.length, header, headerAvailableNames, componentName, SCENE_MAX_ATTEMPTS_PER_LESSON).then((code) => {
              sceneCodes[i] = code;
              sceneErrors[i] = null;

              // Notify the caller the moment THIS scene's code is ready — in
              // whatever order scenes actually resolve. Stitched into a
              // standalone single-scene composition (same technique as the
              // final stitch, using the REAL index so the wrapper references
              // the right component name) so it's directly renderable.
              // Never fatal: a stitch/validate/notify failure here is logged
              // and ignored — it must never affect the real lesson's
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
        const err = contentError(
          `${stillFailingIndices.length}/${scenePlan.length} scene(s) still failing after ${SCENE_MAX_ATTEMPTS_PER_LESSON} attempts each: ${detail}`
        );
        // Propagate an audio-stage attribution if that's what actually
        // killed the failing scene(s).
        const audioFailure = stillFailingIndices.find((i) => sceneErrors[i]?.stage === "audio");
        if (audioFailure !== undefined) err.stage = "audio";
        throw err;
      }

      // Every scenePromises[i] is guaranteed already resolved here — each
      // had to resolve before its generateSceneCode call could start.
      const measuredScenes = await Promise.all(scenePromises);
      const totalFrames = measuredScenes.reduce((sum, s) => sum + s.durationInFrames, 0);

      const stitched = stitchLessonCode({ header, sceneCodes, scenes: measuredScenes, componentName });

      // Final-file validation as defense-in-depth — the duration-sum check
      // passes by construction (stitchLessonCode copies durations verbatim).
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
  // lesson code (LESSON_CODE_MODEL=glm|fable) — one provider choice, one
  // place to change it.
  LESSON_CODE_PROVIDER,
  HEADER_PROVIDER,
  SCENE_PLAN_PROVIDER,
  streamCodeCompletion,
  // Z.ai concurrency limiter for non-scene direct calls (serialized to 1) —
  // sceneService.js's generateScenePlan uses this for its Z.ai-direct call.
  // Per-scene code generation uses its own separate limitZaiSceneCall,
  // internal to this file only.
  limitZaiCall,
  describeError,
  isNonRetryable,
  backoffDelay,
};