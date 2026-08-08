const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");
const pdfParse = require("pdf-parse");
const JSZip = require("jszip");
const { validateGeneratedCode, validateHeaderFragment, validateChunkFragment, validateSceneFragment, getHeaderExposedNames, compactHeaderForPrompt } = require("./validateCode");
const { LESSON_COMPONENT_LIBRARY_SOURCE, LESSON_COMPONENT_NAMES } = require("./lessonComponentLibrary");
const {
  extractReusableCandidates,
  saveCandidates,
  getActiveCatalog,
  getActiveNames,
  getActiveLibrarySource,
  trackUsage: trackLibraryUsage,
  PREVIEW_HEADER_CONTRACT,
} = require("./globalComponentLibrary");
const { reviewGeneratedCode } = require("./codeCriticService");
const { createLimiter } = require("../utils/concurrencyLimiter");
const { recordAiUsage } = require("./aiUsageService");

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════
// OpenRouter — every course-path model (GLM, DeepSeek, Fable) routes through
// here now; one account/key instead of separate direct-vendor clients. GLM
// and DeepSeek each pin `provider: { order: [vendor], allow_fallbacks: true }`
// in their own extraParams below — WITHOUT that pin, OpenRouter's default
// behavior is to load-balance across every third party serving that model
// name, ordered by price, which previously landed GLM traffic on a heavily
// quantized (FP4/Int4) backend that passed validation but crashed at
// runtime. The pin prefers the real vendor's own backend but still allows a
// fallback if that specific backend is briefly unavailable — same tradeoff
// this project already tuned once for GLM, now applied to DeepSeek too.
const openRouterClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 300 * 1000, // hard ceiling; the stream idle-watchdog below fails much faster
  maxRetries: 0,       // retries are handled manually (withRetries)
});

// Anthropic direct — Claude Sonnet 5 lesson/scene/ad code, an OPT-IN
// alternative selectable via LESSON_CODE_MODEL=claude / AD_CODE_MODEL=claude
// (not the default for either path). Deliberately left off OpenRouter —
// Anthropic is the sole backend for its own models, so none of the
// quantized-third-party-backend risk above applies, and this entry is
// shared by both the lesson and ad code-model switches, so moving it isn't
// scoped to "course only". NOT OpenRouter: this hits Anthropic's own
// Messages API, which is a different wire shape from the OpenAI-compatible
// chat-completions surface openRouterClient uses (content blocks + top-level
// `stop_reason`/`usage.input_tokens`, not `delta.content` +
// `finish_reason`/`usage.prompt_tokens`) — streamCodeCompletion branches on
// provider.isAnthropicNative to speak the right one.
const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 300 * 1000,
  maxRetries: 0,
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER TABLE
// ═══════════════════════════════════════════════════════════════════════════
// Reasoning is OFF everywhere on GLM by design: GLM's native `thinking` field
// has no token cap, so leaving it on meant unbounded invisible reasoning
// tokens — measured 200-870+ seconds per call at "high" effort, 987s+ for one
// lesson's code stage. Via OpenRouter this is now the unified
// `reasoning: { enabled: false }` field (GLM's native `thinking` field isn't
// understood by OpenRouter's own API surface, only by Z.ai's).
// `providerName` on every provider object below (CODE_PROVIDERS entries,
// SCENE_PLAN_PROVIDER, DEEPSEEK_*_PROVIDER) is purely a label for the AI
// cost ledger (AiUsageLog.provider / aiUsageService.js) — it plays no part
// in which API actually gets called, that's still driven by `client`/`model`.
const CODE_PROVIDERS = {
  glm: {
    client: openRouterClient,
    model: "z-ai/glm-5.2",
    providerName: "glm",
    // History: unpinned → pinned to z-ai (reverted, see old git history) →
    // pinned to Decart specifically with allow_fallbacks:false (2026-08-06)
    // → this (2026-08-08). The Decart-only pin's hard-fail-if-unavailable
    // choice turned out to cost more than it saved: under a real 6-lesson
    // course's concurrency (header + several chunks per lesson, all firing
    // at once, all forced onto ONE host with zero fallback), Decart's rate
    // limit tripped repeatedly — confirmed live, 3 of 6 lessons in one
    // course permanently failed on sustained 429s, each retry hitting the
    // same saturated limit again immediately.
    //
    // sort:"price" + preferred_min_throughput replaces the single-provider
    // pin: always prefers the cheapest host, but only among ones clearing a
    // speed floor (matches the actual reasoning behind picking Decart
    // before — cheap AND fast, not cheapest at any speed), and — the part
    // the old pin didn't have — automatically falls through to the next
    // cheapest-and-fast-enough host if the top pick 429s or is down, instead
    // of hard-failing the whole lesson. allow_fallbacks TRUE here, matching
    // every other provider.sort/order in this file (see SCENE_PLAN_PROVIDER,
    // DEEPSEEK_*_PLAN_PROVIDER below) — the Decart pin was the one deliberate
    // exception to that pattern, and it's exactly what caused the failures.
    // 40 tokens/sec floor is a starting point (comfortably above the
    // slowest hosts, well below the fastest) — tune against real observed
    // throughput, not on the strength of this comment alone.
    extraParams: { reasoning: { enabled: false }, provider: { sort: "price", preferred_min_throughput: 40, allow_fallbacks: true } },
    maxTokens: 100000,
    keyEnv: "OPENROUTER_API_KEY",
  },
  fable: {
    client: openRouterClient,
    model: "anthropic/claude-fable-5",
    providerName: "fable",
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
  // maxOutputTokens (e.g. LESSON_MAX_OUTPUT_TOKENS), well under Sonnet 5's
  // 128k ceiling.
  claude: {
    client: anthropicClient,
    isAnthropicNative: true,
    model: "claude-sonnet-5",
    providerName: "claude",
    extraParams: {},
    maxTokens: 100000,
    keyEnv: "ANTHROPIC_API_KEY",
  },
  // Model-quality spike (see LESSON_CODE_MODEL=deepseek / AD_CODE_MODEL=
  // deepseek): DeepSeek V4 Flash 0731 — a distinct, newer dated snapshot
  // from the plain "deepseek/deepseek-v4-flash" used for course/scene plan
  // (that alias currently resolves to the older 0423 snapshot). Reasoning
  // off per the same rule as GLM above (see withReasoningOff — LESSON_CODE_
  // PROVIDER_NO_REASONING enforces this regardless of what's set here; set
  // explicitly here too since AD_CODE_PROVIDER's extraParams are used as-is,
  // with no equivalent reasoning-off derivation on the ad path).
  deepseek: {
    client: openRouterClient,
    model: "deepseek/deepseek-v4-flash-0731",
    providerName: "deepseek",
    extraParams: { reasoning: { enabled: false }, provider: { order: ["deepseek"], allow_fallbacks: true } },
    maxTokens: 100000,
    keyEnv: "OPENROUTER_API_KEY",
  },
  // Model-quality spike (see LESSON_CODE_MODEL=minimax / AD_CODE_MODEL=
  // minimax): MiniMax M3, 1M context, multiple third-party hosts on
  // OpenRouter. No `provider: { order: [...] }` pin (unlike glm/deepseek
  // above) — no confirmed evidence yet of a quantized-backend issue on this
  // model the way there was for GLM, so not guessing at a specific host
  // name. No reasoning field either: unconfirmed whether M3 uses OpenRouter's
  // unified `reasoning` field or a different shape, and getting that wrong
  // errors rather than no-ops — left to OpenRouter's default. Lesson-code
  // path still gets reasoning stripped regardless via LESSON_CODE_PROVIDER_
  // NO_REASONING/withReasoningOff; the ad-code path (no such wrapper) may
  // not be, worth checking output for hidden-reasoning latency on that path.
  minimax: {
    client: openRouterClient,
    model: "minimax/minimax-m3",
    providerName: "minimax",
    extraParams: {},
    maxTokens: 100000,
    keyEnv: "OPENROUTER_API_KEY",
  },
  // Model-quality spike (see LESSON_CODE_MODEL=gpt56 / AD_CODE_MODEL=gpt56):
  // GPT-5.6 Sol, OpenAI's own flagship reasoning model, single-sourced from
  // OpenAI itself via OpenRouter — no third-party rehost quantization risk
  // the way an open-weight model (GLM, MiniMax) has, so no provider order
  // pin needed. Reasoning off via OpenRouter's unified field, same as glm/
  // deepseek above. MUCH pricier than every other entry here ($5/$30 per 1M
  // in/out vs cents for GLM/DeepSeek) — a deliberate quality-comparison
  // spike, not something to leave as the lesson-code default.
  gpt56: {
    client: openRouterClient,
    model: "openai/gpt-5.6-sol",
    providerName: "gpt56",
    extraParams: { reasoning: { enabled: false } },
    maxTokens: 128000,
    keyEnv: "OPENROUTER_API_KEY",
  },
  // Model-quality spike (see LESSON_CODE_MODEL=mimo / AD_CODE_MODEL=mimo):
  // Xiaomi MiMo-V2.5, 131K max output, explicitly reasoning-capable via
  // OpenRouter's standard reasoning-tokens abstraction — same `reasoning:
  // {enabled: false}` convention as glm/deepseek above. No provider order
  // pin: multiple third-party hosts exist (DeepInfra among them) but no
  // confirmed quantized-backend incident on this one yet, same reasoning
  // as minimax above for leaving it unpinned.
  mimo: {
    client: openRouterClient,
    model: "xiaomi/mimo-v2.5",
    providerName: "mimo",
    extraParams: { reasoning: { enabled: false } },
    maxTokens: 131072,
    keyEnv: "OPENROUTER_API_KEY",
  },
  // Model-quality spike (see AD_CODE_MODEL=fusion — same allow-list as
  // every entry above, so LESSON_CODE_MODEL=fusion technically works too,
  // but is NOT the recommended use, see why below): OpenRouter Fusion, a
  // multi-model ensemble — fans one call out to a panel of
  // several models in parallel, then a judge model synthesizes their
  // outputs into a single response, billed as the sum of every panel call
  // plus the judge (roughly 4-6x one plain model call's tokens). Left off
  // the lesson-code path deliberately: that path is high-volume (6+ calls
  // per course) and latency-sensitive (streamCodeCompletion's idle
  // watchdog aborts a call after 90s of no streamed chunk — Fusion's own
  // docs don't confirm incremental streaming during the panel+judge phase,
  // so a slow panel could trip that watchdog instead of ever completing).
  // Ad code is the opposite profile — one call per user action, already
  // paying premium Fable pricing for quality — where that cost/latency
  // tradeoff is worth an actual trial. extraParams intentionally minimal
  // (no plugins/panel override) — omitting the `plugins` config uses
  // OpenRouter's own "Quality" preset defaults; tune from there once
  // there's real output to react to, not before.
  fusion: {
    client: openRouterClient,
    model: "openrouter/fusion",
    providerName: "fusion",
    extraParams: {},
    maxTokens: 32000,
    keyEnv: "OPENROUTER_API_KEY",
  },
};

function resolveProvider(envVar, defaultKey) {
  const requested = process.env[envVar];
  const provider = CODE_PROVIDERS[["fable", "glm", "claude", "deepseek", "minimax", "gpt56", "mimo", "fusion"].includes(requested) ? requested : defaultKey];
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
// selects — the single whole-lesson code call runs with reasoning off
// (deterministic code generation gets nothing from a hidden chain-of-
// thought, and on GLM it would draw unbounded invisible tokens from the
// same output budget as the actual code — GLM's native `thinking` field has
// no token cap, unlike DeepSeek's bounded `reasoning_effort`, so this is a
// hard rule on GLM specifically, not just a preference).
//
// The reasoning-toggle FIELD differs by client: Anthropic's own Messages API
// takes `thinking: {type}`. Every OpenRouter-routed provider (glm, fable,
// deepseek) takes OpenRouter's own unified `reasoning: {enabled}` instead —
// sending the wrong shape is either ignored or a 400, not a no-op, so this
// can't be one hardcoded field for every provider.
function withReasoningOff(provider) {
  const { thinking: _t, reasoning_effort: _r, reasoning: _ro, ...rest } = provider.extraParams;
  const reasoningOffParam = provider.client === openRouterClient
    ? { reasoning: { enabled: false } }
    : { thinking: { type: "disabled" } };
  return { ...provider, extraParams: { ...rest, ...reasoningOffParam } };
}
const LESSON_CODE_PROVIDER_NO_REASONING = withReasoningOff(LESSON_CODE_PROVIDER);

// Remedial-lesson-plan / next-course-suggestions: bounded, fixed-shape JSON
// (not code) on GLM 5.2 via OpenRouter — unchanged, lower-stakes calls not
// worth reasoning tokens. Course plan and per-lesson scene plan both run on
// DeepSeek V4 Flash instead (see DEEPSEEK_COURSE_PLAN_PROVIDER /
// DEEPSEEK_SCENE_PLAN_PROVIDER below), reasoning at MAX effort — both set
// the structure everything downstream depends on (the whole course's shape;
// one lesson's scene breakdown, including each scene's mechanism), so the
// extra latency is worth it. "max" is DeepSeek's own top reasoning tier
// (its native `reasoning_effort` field only recognizes "high"/"max" —
// "low"/"medium" are silently remapped up to "high"); confirmed live that
// OpenRouter's unified `reasoning: {effort}` field forwards "max" through to
// DeepSeek without erroring, even though OpenRouter's own documented enum is
// only low/medium/high.
const SCENE_PLAN_PROVIDER = {
  client: openRouterClient,
  model: "z-ai/glm-5.2",
  providerName: "glm",
  // sort:"price" + preferred_min_throughput, same as CODE_PROVIDERS.glm
  // above (see its comment for the full reasoning, including why the
  // earlier Decart-only pin was dropped) — every GLM 5.2 call site in this
  // file should route the same way, not just the lesson-code path.
  extraParams: { reasoning: { enabled: false }, provider: { sort: "price", preferred_min_throughput: 40, allow_fallbacks: true } },
  maxTokens: 40000,
  keyEnv: "OPENROUTER_API_KEY",
};

// `provider: { order: ["deepseek"] }` — same quantized-third-party-backend
// concern as GLM's pin above, applied here as a precaution even though it
// was only ever confirmed as an actual incident on GLM.
const DEEPSEEK_COURSE_PLAN_PROVIDER = {
  client: openRouterClient,
  model: "deepseek/deepseek-v4-flash",
  providerName: "deepseek",
  // Reasoning OFF — was { effort: "max" }, which drew a significant chunk
  // of this call's latency (course plan is on the critical path before any
  // lesson can start building) as invisible reasoning tokens from this same
  // budget, on top of the actual JSON. Turned off deliberately for speed;
  // if plan quality regresses, that's the tradeoff to revisit first.
  extraParams: { reasoning: { enabled: false }, provider: { order: ["deepseek"], allow_fallbacks: true } },
  maxTokens: 40000,
  keyEnv: "OPENROUTER_API_KEY",
};
const DEEPSEEK_SCENE_PLAN_PROVIDER = {
  client: openRouterClient,
  model: "deepseek/deepseek-v4-flash",
  providerName: "deepseek",
  // Reasoning OFF — see DEEPSEEK_COURSE_PLAN_PROVIDER above. This call in
  // particular was measured at 113.6s with max-effort reasoning on.
  extraParams: { reasoning: { enabled: false }, provider: { order: ["deepseek"], allow_fallbacks: true } },
  maxTokens: 40000,
  keyEnv: "OPENROUTER_API_KEY",
};

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENCY
// ═══════════════════════════════════════════════════════════════════════════
// All of these now bound requests against ONE OpenRouter account (every
// course-path provider routes through openRouterClient), not separate
// per-vendor account caps the way they did when GLM/DeepSeek hit Z.ai/
// DeepSeek directly. Kept as separate named pools anyway — they're still
// useful circuit breakers against connection-drop bursts to whichever
// pinned backend (`provider.order`) actually serves a given request, and
// splitting them lets one call category be tuned without affecting others.
// limitZaiCall (default 1) covers remedial-lesson-plan and next-course
// generation — low volume/short calls where the connection-drop risk under
// concurrency isn't worth the tiny time saved.
//
// Lesson code generation is a header call + several SEQUENTIAL scene chunks
// per lesson (see LESSON_HEADER_RULES/LESSON_CHUNK_RULES/generateLessonCode
// below) — roughly 1 + ceil(scenes/LESSON_CHUNK_SCENES) calls per lesson
// (e.g. ~4-5 for a typical 10-14 scene lesson). With buildLessonsConcurrently
// building every lesson in a course at once, that's roughly
// lessonCount × ~4-5 calls that can want to run together (e.g. 6 lessons ×
// ~4 ≈ 24) — well below the ~65-90/course a fully-split one-call-per-scene
// pipeline produced (the call-volume increase that caused a Z.ai-account-
// balance production incident the one time this ran against Z.ai directly —
// see git history / project memory on "single-call-codegen-experiment"),
// but above the ~6/course a single call-per-lesson design needs. 30 gives
// that headroom with no queuing at the default course size; tune against
// real observed throughput/error rates.
const ZAI_MAX_CONCURRENT = Number(process.env.ZAI_MAX_CONCURRENT) || 1;
const limitZaiCall = createLimiter(ZAI_MAX_CONCURRENT);
const LESSON_CODE_MAX_CONCURRENT = Number(process.env.LESSON_CODE_MAX_CONCURRENT) || 30;
const limitLessonCodeCall = createLimiter(LESSON_CODE_MAX_CONCURRENT);
const AD_CODE_MAX_CONCURRENT = Number(process.env.AD_CODE_MAX_CONCURRENT) || 3;
const limitAdCodeCall = createLimiter(AD_CODE_MAX_CONCURRENT);
// Shared by every OpenRouter-routed DeepSeek call: course plan and
// per-lesson scene plan (DEEPSEEK_COURSE_PLAN_PROVIDER /
// DEEPSEEK_SCENE_PLAN_PROVIDER above) and the pre-course level assessment in
// levelAssessmentService.js (which imports this limiter directly). DeepSeek's
// own documented account-wide cap for deepseek-v4-flash was 2,500 concurrent
// requests when hit directly — now mediated through OpenRouter's own
// concurrency handling instead, so that figure is no longer a guaranteed
// ceiling, just the best available evidence that 100 has ample headroom.
const DEEPSEEK_MAX_CONCURRENT = Number(process.env.DEEPSEEK_MAX_CONCURRENT) || 100;
const limitDeepSeekCall = createLimiter(DEEPSEEK_MAX_CONCURRENT);

console.log(
  `[codegen] lesson code → ${LESSON_CODE_PROVIDER.model} (set LESSON_CODE_MODEL=fable | glm | claude | deepseek | minimax | gpt56 | mimo | fusion to switch) | ` +
  `ad code → ${AD_CODE_PROVIDER.model} (set AD_CODE_MODEL=fable | glm | claude | deepseek | minimax | gpt56 | mimo | fusion to switch)`
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
// suggestions: GLM via OpenRouter, shared limiter, truncation detection, safe
// parse, caller-supplied shape validation, and corrective feedback on retry
// (a shape-validation failure message rides into the next attempt's prompt
// exactly like code-gen does). `provider`/`limiter` are overridable (used to
// route course-plan/scene-plan generation to DeepSeek — see
// DEEPSEEK_COURSE_PLAN_PROVIDER above) but remedial/next-course use the
// GLM defaults.
// `onUsage(usage)` is optional — fires with the raw OpenAI-SDK `usage`
// object right before returning, once validation has already succeeded, so
// callers can feed the AI cost ledger (recordAiUsage) without generateJson
// itself needing to know about courseId/userId/kind. Not called on a
// content-error retry — only the attempt that actually succeeds gets logged
// (a rejected attempt's tokens were still spent, but attributing per-retry
// cost isn't worth the complexity this would add for 3 low-volume call sites).
async function generateJson({ label, maxAttempts, maxTokens, buildMessages, validate, provider = SCENE_PLAN_PROVIDER, limiter = limitZaiCall, onUsage = null }) {
  return withRetries(label, maxAttempts, async ({ feedback }) => {
    const response = await limiter(() =>
      provider.client.chat.completions.create({
        model: provider.model,
        ...provider.extraParams,
        max_tokens: maxTokens,
        // Real per-call $ cost in the response's usage.cost — see the
        // identical field on streamOpenAiCompatible's request for the full
        // reasoning. Every provider generateJson is called with routes
        // through OpenRouter.
        usage: { include: true },
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
    const result = validate(parsed, text);
    if (onUsage && response.usage) onUsage(response.usage);
    return result;
  }, { keyEnv: provider.keyEnv });
}

// ═══════════════════════════════════════════════════════════════════════════
// COURSE PLAN
// ═══════════════════════════════════════════════════════════════════════════
function validateCoursePlan(plan, expectedLessonCount = 6) {
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

  return { ok: errors.length === 0, errors };
}

// Shared by generateCourseQuiz below — questions used to be generated
// bundled into the course plan itself (see git history / validateCoursePlan
// above, which used to validate a `questions` array too); this is that same
// shape-validation logic, now standalone since quiz generation is its own
// call.
function validateQuizQuestions(questions, expectedMcqCount) {
  const errors = [];

  if (!Array.isArray(questions) || questions.length !== expectedMcqCount) {
    errors.push(`Expected ${expectedMcqCount} questions, got ${questions?.length ?? "none"}`);
    return { ok: false, errors };
  }

  questions.forEach((q, i) => {
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

async function generateCoursePlan(topic, pdfText, pdfBuffer, sourceFileName, level = null, maxAttempts = 3, lessonCount = 6, { userId = null, courseId = null } = {}) {
  const jsonSchema = `
{
  "lessons": [
    {
      "lessonNumber": 1,
      "title": "string (specific to the topic)",
      "description": "string (2-3 sentences)",
      "keyPoints": ["string", "string", "string", "string"]
    }
  ]
}`;

  const levelGuidance = buildLevelGuidance(level);

  // Quiz questions used to be generated bundled into this same call/schema
  // — moved to a separate generateCourseQuiz call, made AFTER every lesson
  // actually finishes building (see courseController.js's processCourse).
  // Two wins from splitting it out: (1) the quiz can be grounded in each
  // lesson's REAL narration script instead of just this plan's title/
  // description/keyPoints, and (2) this call — the one thing on the
  // critical path before ANY lesson can start building — no longer also
  // has to produce N structured MCQs before lessons.building can begin,
  // shortening time-to-first-lesson.
  const rules = `
Rules:
- All content specific to the topic, never generic
- Exactly 4 keyPoints per lesson
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

Generate a ${lessonCount}-lesson course plan.

Return ONLY valid JSON, no markdown, exactly this structure:
${jsonSchema}
${rules}
`;

  const plan = await generateJson({
    label: `plan`,
    maxAttempts,
    provider: DEEPSEEK_COURSE_PLAN_PROVIDER,
    limiter: limitDeepSeekCall,
    // FIX: was a flat 8000, which a large tier (e.g. 10 lessons from
    // courseController's tier-priced path) could genuinely exceed — scale the
    // budget with the requested shape instead. Floor raised from 3000 to
    // 12000: with high-effort thinking ON, reasoning tokens draw from this
    // SAME max_tokens budget before the actual JSON is written, so the
    // reasoning-off floor left no room once thinking was turned on. No
    // longer scales with mcqCount — quiz generation moved to its own call
    // (see generateCourseQuiz below), so this budget only ever needs to
    // cover lessons now, hence the lower ceiling too (was 40000).
    maxTokens: Math.min(24000, 12000 + lessonCount * 500),
    buildMessages: (feedback) => [{ role: "user", content: basePrompt + feedbackSuffix(feedback) }],
    validate: (parsed, raw) => {
      const { ok, errors } = validateCoursePlan(parsed, lessonCount);
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
    onUsage: (usage) => recordAiUsage({
      kind: "course-plan",
      provider: DEEPSEEK_COURSE_PLAN_PROVIDER.providerName,
      model: DEEPSEEK_COURSE_PLAN_PROVIDER.model,
      userId,
      courseId,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cachedTokens: usage.prompt_cache_hit_tokens || 0,
      costUsd: usage.cost ?? null,
    }),
  });

  if (truncated) plan.__truncatedInput = true;
  return plan;
}

// ── Course quiz (generated AFTER every lesson is built) ─────────────────────
// Grounded in each lesson's REAL narration script (see courseController.js's
// buildLesson, which now persists lessons.N.narrationScript from the
// measured scene plan) instead of just the pre-generation plan's title/
// description/keyPoints — questions can test what the course actually SAID,
// not just what it was outlined to cover. `lessons` here is the BUILT
// course's lesson array — only `title` and `narrationScript` are read; a
// lesson that failed to build (no narrationScript) still gets a `topic`
// bucket via its title alone, so a partial course still gets a usable quiz.
const MAX_NARRATION_CHARS_PER_LESSON = 6000;

async function generateCourseQuiz(topic, lessons, mcqCount = 20, maxAttempts = 3, { userId = null, courseId = null } = {}) {
  const lessonContext = lessons
    .map((l, i) => {
      const narration = (l.narrationScript || "").slice(0, MAX_NARRATION_CHARS_PER_LESSON);
      return `LESSON ${i + 1}: ${l.title}\n${narration || "(no narration available — this lesson may have failed to generate; write questions for it from its title alone, or skip it in favor of the other lessons if that reads better)"}`;
    })
    .join("\n\n");

  const jsonSchema = `
{
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

  const basePrompt = `
You are an expert educational assessment designer. Below is the FULL narrated content of every lesson in a course called "${topic}" — the actual script spoken in each lesson's video, not just an outline.

${lessonContext}

Generate a ${mcqCount}-question multiple-choice assessment testing comprehension of what these lessons ACTUALLY teach — ground each question in a specific fact, mechanism, or explanation that appears in the narration above, not generic knowledge about the topic. Distribute questions across all ${lessons.length} lessons (roughly evenly, weighted toward lessons with more content). Each question's "topic" field must be the EXACT title of the lesson it's drawn from (copy it character-for-character from "LESSON N: <title>" above), so results can be grouped back to the right lesson.

Return ONLY valid JSON, no markdown, exactly this structure:
${jsonSchema}

Rules:
- "correct" is the 0-based index into "options"
- Exactly 4 options per question, one correct
- Pure JSON only, no backticks
- CRITICAL: Respond with ONLY the JSON object. No commentary, no acknowledgment. Never refuse and never ask a follow-up question — always produce the JSON.`;

  const result = await generateJson({
    label: `quiz`,
    maxAttempts,
    provider: DEEPSEEK_COURSE_PLAN_PROVIDER,
    limiter: limitDeepSeekCall,
    maxTokens: Math.min(40000, 8000 + mcqCount * 250),
    buildMessages: (feedback) => [{ role: "user", content: basePrompt + feedbackSuffix(feedback) }],
    validate: (parsed, raw) => {
      const { ok, errors } = validateQuizQuestions(parsed?.questions, mcqCount);
      if (!ok) {
        throw contentError(
          `Quiz generation failed shape validation: ${errors.join("; ")}. Raw response (first 500 chars): ${raw.slice(0, 500)}`
        );
      }
      return parsed.questions;
    },
    onUsage: (usage) => recordAiUsage({
      kind: "course-quiz",
      provider: DEEPSEEK_COURSE_PLAN_PROVIDER.providerName,
      model: DEEPSEEK_COURSE_PLAN_PROVIDER.model,
      userId,
      courseId,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cachedTokens: usage.prompt_cache_hit_tokens || 0,
      costUsd: usage.cost ?? null,
    }),
  });

  return result;
}

// ── Remedial lesson plan (collaborative courses) ────────────────────────────
// {title, description, keyPoints} for ONE new lesson targeting the group's
// weakest topic; hands off to the existing buildLesson pipeline. Deliberately
// re-teaches from a different angle than a first pass would.
async function generateRemedialLessonPlan(courseTopic, weakTopic, groupAvgPct, maxAttempts = 3, { userId = null, courseId = null } = {}) {
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
    onUsage: (usage) => recordAiUsage({
      kind: "remedial-plan",
      provider: SCENE_PLAN_PROVIDER.providerName,
      model: SCENE_PLAN_PROVIDER.model,
      userId,
      courseId,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cachedTokens: usage.prompt_cache_hit_tokens || 0,
      costUsd: usage.cost ?? null,
    }),
  });
}

// ── Continuous learning: next-course suggestions ────────────────────────────
async function generateNextCourseSuggestions(completedTopic, weakTopics = [], maxAttempts = 2, { userId = null, courseId = null } = {}) {
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
    onUsage: (usage) => recordAiUsage({
      kind: "next-course",
      provider: SCENE_PLAN_PROVIDER.providerName,
      model: SCENE_PLAN_PROVIDER.model,
      userId,
      courseId,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cachedTokens: usage.prompt_cache_hit_tokens || 0,
      costUsd: usage.cost ?? null,
    }),
  });

  return parsed.suggestions;
}

// ═══════════════════════════════════════════════════════════════════════════
// LESSON CODE-GEN PROMPTS — header call + sequential scene chunks
// ═══════════════════════════════════════════════════════════════════════════
// A lesson's code generates as: ONE small header call (shared visual
// identity — palette, motif, ZONES, helpers), then SEQUENTIAL chunks of a
// few scenes each, then a deterministic (non-LLM) stitch of the final
// <Series> wrapper. Both header and chunk calls run on GLM 5.2
// (LESSON_CODE_MODEL) via OpenRouter, reasoning OFF (GLM's native `thinking`
// field has no token cap, so leaving it on would draw unbounded invisible
// tokens from the same budget as the actual code).
//
// This replaces a brief single-call-whole-lesson design (one response for
// header+every scene+the closing <Series>): that fixed a real cross-scene
// consistency bug (independent parallel scene calls couldn't see what
// sibling scenes invented) but introduced a worse cost problem — a syntax
// slip ANYWHERE in an 11-scene, ~15K-output-token response invalidated the
// WHOLE thing, and every retry re-billed all of it. Splitting into small
// SEQUENTIAL chunks (not parallel — that's what caused the original
// consistency bug) fixes both at once: each call is small enough to match
// the historically low failure rate of the old one-scene-per-call pipeline,
// a failure only re-bills its own chunk (not the whole lesson), and each
// chunk still sees every prior chunk's ACTUAL generated code as context, so
// it can copy a shared graph/array/dataset by exact name instead of
// re-deriving it — the same pattern that emerged naturally in testing.

const LESSON_HEADER_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "i" (from "import"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer. You are building the SHARED FOUNDATION for an educational lesson — imports, a palette, a recurring motif, and reusable helper components — that every scene of this lesson will reference by exact name. You do NOT write any scene's content, and you do NOT write the <Series> wrapper that plays the scenes — those come later, built by other code.

LESSON VISUAL IDENTITY — decide once, it must serve EVERY scene of this lesson:
  • PALETTE: 3-4 colors derived from the SUBJECT, not a default. Biology→living greens; electronics→copper/PCB-green; finance→ink+ledger tones; astronomy→deep space + stellar accents; history→parchment/sepia; chemistry→lab-glass teals with reagent accents; economics→newsprint neutrals with one signal color. One background base, one primary accent (the "hero" color), one or two supporting hues — AND one dedicated TEXT color guaranteed high-contrast against the background base (near-white on dark bases, near-black on light bases). Declare ALL of these as named consts (a PALETTE object with a .text key) every scene will reuse.
  • MOTIF: one recurring visual element or geometry that threads through the lesson (a grid, a flowing current, orbital paths, a timeline spine, cells, layers). Build it as a reusable helper component named EXACTLY \`Backdrop\` (every scene will use this exact name for Layer 1 — a different name breaks every scene that references it). It MUST be in continuous motion (a slow gradient drift, a pulsing hue, a gently shifting pattern) — a static motif gives every scene a dead base layer. The motif's OWN geometry should echo the subject where possible — the motif is the single biggest lever for the lesson NOT looking like every other lesson.
  • TONE: match motion energy to the subject. A meditation lesson breathes slowly; a rocket-launch lesson is kinetic.

SANDBOX API — violate and the build fails:
1. Do NOT write "export" anywhere. This file is only imports + consts + helper function components — no exported component, no scenes.
2. Import ONLY from "remotion" and "react".
   • From "remotion": any named export EXCEPT staticFile (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop).
   • From "react": ONLY useMemo, useCallback, useRef. useState DOES NOT EXIST here and crashes the video.
   • No other imports of any kind — this is the ONLY place imports are written for the whole lesson.
3. NO props, NO external/dynamic data. Every identifier must be locally declared or a listed remotion/react export.
   • NEVER shadow a JS built-in (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set).
   • NEVER declare a top-level name matching /^Scene\\d+$/ — those are reserved for scenes.
4. Do NOT render <Series>, <Series.Sequence>, or <Audio> anywhere — there is no scene content here to sequence.
5. SVG elements (<circle>, <rect>, <line>, <path>, <text>, <g>, <polygon>, <polyline>) ONLY render inside an <svg> tag — a shared helper that returns bare SVG shapes renders NOTHING once a scene drops it into a <div>/<AbsoluteFill> (no crash, no warning — it just silently doesn't exist). Every shared visual helper must be SELF-CONTAINED: either plain HTML (<div>/<AbsoluteFill>) or its OWN full-frame <svg style={SVG_FRAME}> (defined below) with the shapes inside.
   • ⚠️ SVG_FRAME MUST be applied as style={SVG_FRAME} — NEVER spread as <svg {...SVG_FRAME}>. position/left/top/pointerEvents are not real SVG/HTML attributes; spread as bare props they silently no-op (the browser's computed position stays "static", NOT "absolute") and the <svg> falls into normal document flow instead of overlaying at (0,0). A scene calling Nucleus/BondLine/AngleArc/etc. more than once then stacks each one sequentially in flow — pushing every one after the first thousands of pixels outside the visible frame, invisible, with no error and no warning. This is a real, previously-shipped bug: verified live in a production lesson via computed-style inspection (attribute position="absolute" present, computed position: "static"), which silently blanked most scenes of the lesson while Backdrop and audio kept working. style={SVG_FRAME} is the only correct usage.
   • Any helper (like Label/Panel) that wraps content MUST accept and render {children} ({ children } — NO type annotation; "React" is NOT imported, so "React.X" crashes with "React is not defined").
6. Any helper using useCurrentFrame() resets to 0 every time the scene that mounts it starts — design its motion (Math.sin(frame/k)) so it looks right from frame 0.

FRAME-BOUNDARY SAFETY — every scene will rely on these exact consts, define them here:
    const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
    const FRAME = { w: 1920, h: 1080 };
    const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
    const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const SVG_FRAME = { position: "absolute" as const, left: 0, top: 0, width: 1920, height: 1080, pointerEvents: "none" as const, overflow: "visible" as const };
SVG_FRAME exists ONLY to be applied as style={SVG_FRAME} on a full-frame overlay <svg> (see rule 5 above) — every scene reuses this exact name/shape so there is never a reason to hand-roll a second version of it.
If this lesson's subject involves direction, vectors, forces, or angles (physics, math, engineering, navigation), also build shared Arrow({from,to,color,width}) and AngleArc({vertex,angle1,angle2,radius,color}) helpers here, computing direction with Math.atan2(dy,dx). Every point argument (from/to/vertex) is a plain {x, y} object — NEVER an array, NEVER {cx, cy}. Destructure it as const {x, y} = point inside the helper itself, and every scene that calls Arrow/AngleArc must pass that same {x, y} shape — this helper and its callers are generated separately and never see each other's code, so an inconsistent shape here (an array, a {cx,cy} pair, or a missing point) is a real crash that has shipped to production before ("X is not iterable" / "Cannot read properties of undefined (reading 'cx')").

INTERPOLATE SAFETY (applies to Backdrop and every helper here that animates): interpolate() and interpolateColors() ALWAYS need exactly 3 arguments (or 4 with an options object). The 2nd/3rd arguments MUST be array literals of plain number literals, and MUST be the SAME LENGTH as each other — a real production crash came from exactly this: an inputRange/outputRange length mismatch inside Backdrop. inputRange strictly increasing, no repeats.

SHARED EXAMPLE DATA — read the SCENES table below carefully for this: if several scenes are clearly walking through the SAME concrete worked example (the same algorithm run on the same graph, the same array being sorted, the same dataset, the same numeric example carried across steps — recognizable because their onScreenText/mechanism/visualDescription describe progressive states of ONE example, e.g. several "algorithm-trace" domainSkill scenes in a row), declare that example's actual DATA here as its own named top-level const (e.g. const DIJKSTRA_GRAPH = { nodes: [...], edges: [...] };, or const SORT_ARRAY = [...];) — not just a rendering helper, the literal data itself, sized/shaped to support every state those scenes individually need to show (every node, every edge, every value any of those scenes will highlight or change). Every scene chunk is generated separately and in PARALLEL with no visibility into each other's code, but EVERY chunk sees this header verbatim — so a graph/array declared here by name is the ONLY way parallel scenes are guaranteed to reference the exact same example instead of each independently inventing its own (this was a real reported bug: a multi-scene Dijkstra's algorithm walkthrough where every scene showed a different graph). If no scenes share a concrete example, skip this — don't invent shared data nothing needs.

LAYOUT ZONES — copy this EXACT const, verbatim, unchanged:
    const ZONES = {
      title:   { x: 120, y: 120, w: 1680, h: 130, cx: 960 },
      stage:   { x: 120, y: 270, w: 1680, h: 580, cx: 960, cy: 560 },
      caption: { x: 120, y: 870, w: 1680, h: 90,  cx: 960 },
    };
title = the headline/title band (top). stage = the main Layer-2 diagram's working area (middle — generous, not a cage). caption = the onScreenText band (bottom). Scenes reference ZONES.title/.stage/.caption by name — never redeclare this object or invent alternate zone numbers.

SHARED TEXT + FRAMING HELPERS:
  • Label({ children, size }): a text component using PALETTE.text with a strong textShadow (e.g. "0 2px 20px rgba(0,0,0,0.8)") baked in, so text is always readable over the motif. Scenes pass their own position/animation but never redefine the color/shadow.
  • Panel({ children, width, height }) OR Glow({ color, size }) — pick whichever suits the subject better.

CODE QUALITY: Inline styles only (no Tailwind, no className for styling, no external CSS). No registerRoot, no Composition, no export. Never leave a "TODO" — every const/component you declare must be complete, working code a scene could use immediately.

REUSABLE COMPONENT LIBRARY (grown from real lessons, not hand-written): a catalog of already-built, admin-approved components may be listed below, under "AVAILABLE LIBRARY COMPONENTS" — these are ALREADY IN SCOPE, do not redeclare or reimport them, just call them directly by name (e.g. <Gear radius={80} teeth={12} color={PALETTE.accent} cx={960} cy={540} />) exactly like you would call Backdrop or Label. Check that list FIRST — if one fits what this lesson needs, use it instead of building your own.
  • If NONE of them fit and you need something genuinely GENERIC — a shape, mechanism, or animated element that other lessons on OTHER subjects could plausibly reuse too (a gear, a wave, a particle, a directional arrow, an orbiting body — NOT anything tied to this lesson's specific facts, names, or numbers) — you may define it as a normal shared helper here, AND additionally mark it for the library by writing exactly these two comment lines immediately above its declaration:
      // @reusable: ComponentName — one-line description of what it does and when to use it
      // @example: <ComponentName someProp={123} otherProp={PALETTE.accent} .../>
    The @example line must be valid, working JSX using ONLY props that component actually accepts, since it's used verbatim to preview the component later — get it right.
  • Do NOT mark something reusable just to mark it. Most helpers you write ARE lesson-specific (they reference this lesson's own PALETTE choices, this lesson's own subject) and should NOT be marked — reserve @reusable for something you'd genuinely expect to be useful in a completely different lesson on a different subject.

Begin with imports, then CLAMP/FRAME/SAFE/clampPos/ZONES (verbatim), then your palette const, then your shared helper components (checking the library catalog first). Your entire response is the code file, first characters "import", no text or fences around it.
`;

// Renders the active-component catalog (see globalComponentLibrary's own
// comment) into the compact "name — description (props)" listing shown to
// the header prompt — never the actual code, so this stays small regardless
// of how large the library grows.
function buildLibraryCatalogBlock(catalog) {
  if (!catalog || catalog.length === 0) return "";
  const lines = catalog
    .map((c) => `  • ${c.name}${c.propsDoc ? ` ${c.propsDoc}` : ""} — ${c.description}`)
    .join("\n");
  return `\nAVAILABLE LIBRARY COMPONENTS (already in scope — call directly, do not redeclare):\n${lines}\n`;
}

function buildHeaderUserContent(lesson, scenes, catalog = []) {
  const sceneTable = scenes
    .map((s, i) => {
      const m = s.mechanism;
      const mechanismBlock =
        m && m.before && m.after && m.driver
          ? `mechanism: starts at "${m.before}", ends at "${m.after}", driven by "${m.driver}"`
          : "";
      return `Scene ${i + 1}: visualType: ${s.visualType}${s.domainSkill && s.domainSkill !== "none" ? `, domainSkill: ${s.domainSkill}` : ""}
   onScreenText: ${s.onScreenText}${mechanismBlock ? `
   ${mechanismBlock}` : ""}
   visualDescription: ${s.visualDescription}`;
    })
    .join("\n\n");

  return `
LESSON: ${lesson.title}
${lesson.description ? "LESSON SUMMARY: " + lesson.description + "\n" : ""}TOTAL SCENES: ${scenes.length}

Derive ONE lesson-wide VISUAL IDENTITY (palette + motif) from "${lesson.title}" that will suit ALL ${scenes.length} scenes below. Do not write any scene's content — just the shared imports, palette/motif consts, and reusable helper components.
${buildLibraryCatalogBlock(catalog)}
SCENES (context only, so your palette/motif choice suits all of them, AND so you can spot scenes that share one concrete example — see SHARED EXAMPLE DATA below — do not build these):

${sceneTable}
`;
}

const LESSON_CHUNK_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code. No prose, no explanation, no markdown fences. The FIRST character of your response must be "f" (from "function"). Anything else fails the build and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer writing a GROUP of scenes for a visually astonishing educational lesson. This is a premium learning product — every scene must feel alive, dynamic, and visually connected to the concept being taught. The HEADER CODE below (already generated) has this lesson's imports, palette, and shared helper components declared and in scope — reference those exact names; never redeclare, reimport, or rename them. Other chunks of this same lesson are being written IN PARALLEL, right now, by separate calls that cannot see each other's output — you will NOT be shown any other chunk's actual code, only the SPEC (not code) of the lesson's other scenes, for context. Never assume a name from another chunk is in scope; the only names available to you are the header's and your own.

STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
1. Write EXACTLY one top-level declaration per scene: function SceneN() { ... }, using the EXACT names given to you (these are ABSOLUTE scene numbers for the whole lesson, not counted from 1 within your group) — no parameters, no props. A local helper used by only ONE scene must be a function NESTED inside that scene's own function — never a second top-level declaration (it would collide with another scene). The one exception is rule 1a below.
1a. If two of YOUR OWN scenes in this chunk need a piece of DATA that must stay identical between them (a specific graph, a specific array, a specific dataset — see CROSS-SCENE DATA CONSISTENCY below), declare it as its OWN top-level const, a sibling to your scene functions, NOT nested inside one — a const declared inside a function only exists inside that function. This only helps within THIS chunk — a scene in another chunk cannot see it (chunks run in parallel, not in sequence).
2. Do NOT write ANY import statement. Everything you need is already imported/declared by the header below and in scope for you.
   From "react": ONLY useMemo, useCallback, useRef exist. useState DOES NOT EXIST here and crashes the video.
3. NO external/dynamic data. Every identifier must be locally declared (inside your function, or top-level per rule 1a) or a listed remotion/react export, or something declared in the header code below. Never reference a name you'd expect another chunk to declare — it will not exist.
   • NEVER shadow a JS built-in (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set).
   • ⚠️ Do NOT invent an additional header-level helper name that ISN'T actually in the HEADER CODE shown to you below — a plausible-sounding name like GroundLine, LabelTextWithPointer, LayerTag, or PartLegend is not automatically real just because it fits this scene's visual. The header exports EXACTLY what you can see in it, nothing more. If you need a labeled line, a pointer callout, a tag, or a legend and the header doesn't already provide it, build it yourself as a helper NESTED inside your own scene function (per rule 1) — this exact mistake (assuming an uncalled-for header helper exists) is a repeat cause of failed generations.
4. Do NOT render <Series>, <Series.Sequence>, or <Audio> — your scenes are combined with the header and every other chunk into those wrappers by other code after you return your functions.
5. EACH SCENE'S DURATION is given to you as a literal number. Hardcode that literal directly in your interpolate() calls for pacing — do not read it from a variable, it does not exist in scope.
6. FRAME NUMBERS ARE PER-SCENE. useCurrentFrame() resets to 0 at the start of EACH of your scenes — never offset a timing as if another scene's duration applies. Entrances live near [0, 30]; exits near [thisSceneDuration - 30, thisSceneDuration], written as literals of THAT scene's own duration.
7. Aim for roughly 300-400 lines PER SCENE — rich, detailed animation, but concise: every extra line is extra generation time. Extract any local helper once near the top of that scene's function and reuse it within that scene.

CROSS-SCENE DATA CONSISTENCY — chunks generate IN PARALLEL now, so you cannot copy another chunk's exact code byte-for-byte the way you could in the old sequential pipeline. FIRST check the HEADER CODE below: if your scene is part of a worked example that spans multiple scenes (an algorithm walkthrough, a sort/search trace, a running numeric example), the header may have ALREADY declared that example's exact data as a named top-level const (e.g. DIJKSTRA_GRAPH, SORT_ARRAY) specifically so every scene uses the identical example — if it's there, you MUST reference it by that exact name, never redeclare or invent your own version. Only if the header did NOT declare it (the example wasn't flagged as shared, or you're genuinely the only scene using it) do you fall back to independently building the SAME canonical version of that example from the shared subject matter — the standard/obvious textbook instance of it, not an arbitrary one you invent — so two independent derivations are likely to land on the same values even without seeing each other's code. Within YOUR OWN chunk, scenes CAN and should share exact values via rule 1a.

ANIMATION QUALITY — THE MOST CRITICAL REQUIREMENT. A boring animation is a failed animation.
8. CONTINUOUS MOTION IS NON-NEGOTIABLE. At frame 0, things move. At the midpoint, things move. At the final frame, things move. Use Math.sin(frame/k), Math.cos(frame/k), and (frame*speed)%360 to guarantee perpetual motion on every element.
9. ILLUSTRATE THE EXACT CONCEPT — not generic particles. Each scene is given its mechanism (the state it starts in, the state it ends in, the visible action that drives that change) — build exactly that transformation. The animation must make the concept VISIBLE without reading the text.
10. THREE MANDATORY LAYERS in every scene, anchored to the header's fixed ZONES (never hand-picked coordinates):
   - Layer 1 (background): the header's Backdrop component (that exact name) as the base layer.
   - Layer 2 (concept): the main animated diagram, footprint centered/sized to fit inside ZONES.stage — generous, not a cage, never drifting into title/caption. The star of the scene.
   - Layer 3 (text): on-screen text inside ZONES.caption (and a title inside ZONES.title if this scene has one), springing or fading in, never overlapping Layer 2.
11. RICHNESS — every scene needs at least: 3+ animated elements, one spring() entrance, one continuous Math.sin/cos motion, glow effects (boxShadow with a palette color), and its onScreenText appearing with a stagger. ENFORCED: a scene that's only a title over a plain background, with no Layer-2 diagram, WILL be rejected.

VISUAL CONTINUITY: reuse the header's palette/motif/helpers/ZONES by NAME — never invent your own colors or redeclare a name already declared. Render text through the header's Label helper, not a hand-styled <div>.

REUSABLE COMPONENT LIBRARY (grown from real lessons): if the header code above already lists components under "AVAILABLE LIBRARY COMPONENTS", or declares AnimatedGraph/AnimatedArray, check those first and call one directly if it fits instead of hand-building the same thing again.
  • If you build a local helper (nested inside your OWN scene function, per rule 1 — this does not change where you declare it) that is genuinely GENERIC — a shape/mechanism/animated element other lessons on OTHER subjects could plausibly reuse, NOT anything tied to this lesson's specific facts, labels, or data — you may mark it for the library by writing exactly these two comment lines immediately above its declaration:
      // @reusable: ComponentName — one-line description of what it does and when to use it
      // @example: <ComponentName someProp={123} otherProp={PALETTE.accent} .../>
    For a marked component to actually be reusable elsewhere, it MUST be self-contained: call its OWN useCurrentFrame() internally rather than reading the enclosing scene's frame variable, and depend on nothing outside PALETTE.bg/.accent/.text, CLAMP/SAFE/ZONES/clampPos/SVG_FRAME, and its own props — never a variable local to your scene.
  • Be conservative — most local helpers ARE lesson-specific and should NOT be marked. Reserve this for something you'd genuinely expect a different lesson on a different subject to reuse. The @example line must be valid, working JSX using only props that component actually accepts.

PREBUILT COMPONENTS — the header/library code below also already declares AnimatedGraph({nodes,edges,activeNodes,highlightEdges,area}) and AnimatedArray({values,highlightIndices,area}) (hand-built, tested, not something you write). If a scene's domainSkill is "algorithm-trace" — a graph/tree/network being traversed, or an array/list being sorted/searched/manipulated — STRONGLY PREFER calling one of these with data instead of hand-writing the diagram's SVG yourself: pass nodes/edges (or values/highlightIndices) as plain data objects/arrays, using each entry's revealAt (a frame number) to stage when it appears. If the header declared a shared example const for this exact algorithm/dataset (see CROSS-SCENE DATA CONSISTENCY above), pass ITS nodes/edges/values into AnimatedGraph/AnimatedArray — don't invent a parallel, different dataset just because you're also free to pass "plain data objects". Do not redeclare AnimatedGraph/AnimatedArray, and do not hand-roll an equivalent from raw <svg> when one of these already fits — that's exactly the free-form code this exists to replace. For scenes that don't fit either shape, build Layer 2 by hand as usual.

INTERPOLATE SAFETY — these violations CRASH the video at runtime, no exceptions:
12. interpolate() AND interpolateColors() ALWAYS need exactly 3 arguments. The 2nd/3rd arguments MUST be array literals — [0, 20] — plain number literals only, no variables/expressions inside, and MUST be the SAME LENGTH as each other (e.g. [0, 30, 60] needs exactly 3 output values, not 2 and not 17 — a mismatched length crashes immediately). inputRange strictly increasing, no repeats. For hold-at-final-value: 2 values + CLAMP.
    A repeat mistake: writing const positions = [10, 50, 90]; then interpolate(frame, [0, dur], positions) — WRONG, positions is a variable, not a literal. Write the array INLINE at the call site every time, even if the same values are reused across several interpolate() calls: interpolate(frame, [0, dur], [10, 50, 90]).
13. NEVER produce NaN in any SVG attribute — guard all division (v/(d||1)) and array access; filter NaN out of polygon/polyline points.
14. CLAMP entrance/exit animations with the header's CLAMP constant. Continuous Math.sin/cos motion doesn't need CLAMP.
15. THE 1920x1080 FRAME IS A HARD BOUNDARY. Route every final x/y/cx/cy/top/left value through the header's clampPos() to SAFE as its LAST step.
16. SVG elements ONLY render inside an <svg> tag — wrap any group of SVG primitives in its own full-frame <svg style={SVG_FRAME}> (the header's SVG_FRAME const — reuse it by name, never redeclare it). ⚠️ ALWAYS style={SVG_FRAME}, NEVER <svg {...SVG_FRAME}> — spreading it as bare props silently drops the positioning (computed position stays "static" instead of "absolute"), so any scene calling Nucleus/BondLine/AngleArc/etc. more than once stacks them in normal document flow instead of overlaying at (0,0), pushing everything after the first element thousands of pixels off-screen — no crash, no warning, just a blank scene. This exact mistake has shipped to production before.
17. NEVER write comma-separated expressions directly inside JSX curly braces: {a, b} is invalid JSX.


Write ONLY the scene functions given to you, in order, back to back — no import, no export, no <Series>/<Series.Sequence>/<Audio>. Your entire response is code, first characters "function", no text or fences around it.
`;

// Spec-only (never code) table of every OTHER scene in the lesson, for
// CROSS-SCENE DATA CONSISTENCY context now that chunks generate in parallel
// and can't see each other's actual output — see the "chunks generate IN
// PARALLEL now" note in LESSON_CHUNK_RULES.
function buildOtherScenesSpecTable(allScenes, chunkStartIndex, chunkLength) {
  return allScenes
    .map((s, i) => {
      if (i >= chunkStartIndex && i < chunkStartIndex + chunkLength) return null; // this chunk's own scenes, already given in full below
      const m = s.mechanism;
      const mechanismBlock =
        m && m.before && m.after && m.driver
          ? `mechanism: starts at "${m.before}", ends at "${m.after}", driven by "${m.driver}"`
          : `mechanism: not provided.`;
      return `Scene ${i + 1}: visualType: ${s.visualType}${s.domainSkill && s.domainSkill !== "none" ? `, domainSkill: ${s.domainSkill}` : ""}
   onScreenText: ${s.onScreenText}
   ${mechanismBlock}
   visualDescription: ${s.visualDescription}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

// Ordered so everything IDENTICAL across a lesson's chunk calls (the lesson
// line + header code) comes FIRST and this chunk's own scene specs come
// LAST — forms the longest possible shared prefix across calls, which is
// what automatic prefix caching keys off of.
function buildChunkUserContent(lesson, componentName, chunkScenes, chunkStartIndex, totalScenes, headerCode, allScenes) {
  const sceneTable = chunkScenes
    .map((s, i) => {
      const absoluteIndex = chunkStartIndex + i;
      const sceneName = sceneComponentName(absoluteIndex);
      const m = s.mechanism;
      const mechanismBlock =
        m && m.before && m.after && m.driver
          ? `mechanism: starts at "${m.before}", ends at "${m.after}", driven by "${m.driver}"`
          : `mechanism: not provided — derive it from the visualDescription.`;
      return `SCENE ${absoluteIndex + 1} of ${totalScenes}
YOUR FUNCTION NAME (use exactly this): ${sceneName}
durationInFrames: ${s.durationInFrames}
visualType: ${s.visualType}${s.domainSkill && s.domainSkill !== "none" ? `
domainSkill: ${s.domainSkill}` : ""}
onScreenText (render verbatim): ${s.onScreenText}
${mechanismBlock}
visualDescription: ${s.visualDescription}`;
    })
    .join("\n\n");

  return `
LESSON: ${lesson.title} (component ${componentName})

HEADER CODE (already imported/declared — reference these exact names, do not redeclare or reimport):
\`\`\`tsx
${headerCode}
\`\`\`
${(() => {
    const otherScenesSpec = buildOtherScenesSpecTable(allScenes, chunkStartIndex, chunkScenes.length);
    return otherScenesSpec ? `
OTHER SCENES IN THIS LESSON (SPEC ONLY, not code — written by a SEPARATE parallel call, you will NOT see their actual generated code; use only for CROSS-SCENE DATA CONSISTENCY, never assume a name from here is in scope):
${otherScenesSpec}
` : "";
  })()}
Write ONLY these ${chunkScenes.length} scene(s), in order:

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
    logVerbose(`  [autofix] Applied: ${notes.join(" | ")}`);
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

// A real course is 60-90+ GLM calls (a header + several 3-scene chunks per
// lesson, times 6 lessons, plus retries) — every one of those calls used to
// print its own "Attempt N/M...", then its own "Valid code generated (chars)
// — took Xs" receipt, then its own token-count line, ALL interleaved across
// several lessons building concurrently. Genuinely useful when actively
// debugging one specific generation; genuinely noisy as the default
// live-log experience for "is my course still building" — one course could
// print 200+ lines of routine success chatter.
//
// This gates exactly that: per-call progress/success logs. It does NOT gate
// console.warn/console.error anywhere in this file — an actual failure, a
// retry, or a validation rejection is signal you want regardless of this
// flag, never noise. Also doesn't touch courseController.js's own logs,
// which are already per-LESSON milestones (6 lessons × ~4 lines), not
// per-call — the right granularity already.
const VERBOSE_CODEGEN_LOGS = process.env.VERBOSE_CODEGEN_LOGS === "true";
function logVerbose(...args) {
  if (VERBOSE_CODEGEN_LOGS) console.log(...args);
}

function logUsage(label, usage) {
  if (!usage) return;
  logVerbose(
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

// sessionId (optional): OpenRouter's provider-sticky-routing key — see
// buildLessonSessionId below for what it's built from and why. Only
// meaningful for the OpenRouter-routed path (streamOpenAiCompatible);
// Anthropic-native calls (streamAnthropicNative) have no such concept and
// silently ignore it.
async function streamCodeCompletion({ limiter, provider, systemPrompt, userContent, maxOutputTokens, sessionId = null }) {
  return limiter(() =>
    provider.isAnthropicNative
      ? streamAnthropicNative({ provider, systemPrompt, userContent, maxOutputTokens })
      : streamOpenAiCompatible({ provider, systemPrompt, userContent, maxOutputTokens, sessionId })
  );
}

// GLM, DeepSeek, and Fable — every OpenRouter-routed provider — all speak
// the OpenAI chat-completions wire shape — this is that path.
async function streamOpenAiCompatible({ provider, systemPrompt, userContent, maxOutputTokens, sessionId = null }) {
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
      // OpenRouter-specific: makes the final usage chunk carry a `cost`
      // field — the ACTUAL dollar amount OpenRouter billed for this exact
      // call, reflecting whichever provider ended up serving it (relevant
      // now that CODE_PROVIDERS.glm/SCENE_PLAN_PROVIDER route on sort:
      // "price" rather than a single pinned provider) and any cache
      // discount really applied — not the static config/modelPricing.js
      // estimate, which can't know either of those. Every caller of this
      // function routes through OpenRouter (see this function's own
      // top-of-section comment), so this is safe unconditionally.
      usage: { include: true },
      // OpenRouter's provider-sticky-routing key (see buildLessonSessionId)
      // — routes every call sharing this id to the same backend instance,
      // which is what lets a cache written by an earlier call in this
      // lesson (the header, an earlier chunk, a prior retry attempt) actually
      // be reused instead of each call landing on a random replica with
      // nothing to hit. A top-level request field per OpenRouter's own
      // prompt-caching docs — harmless to omit for a provider that ignores
      // it, so this is unconditional, not gated per-provider.
      ...(sessionId ? { session_id: sessionId } : {}),
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

// Single source of truth for scene component names — used by the chunk
// prompt, the validator, and the stitcher, so they can never disagree.
function sceneComponentName(index) {
  return `Scene${index + 1}`;
}

// OpenRouter's provider-sticky-routing key (see the comment on the
// session_id field in streamOpenAiCompatible) — every call that belongs to
// generating ONE lesson (its header, every scene chunk, and any retry of
// either) shares this same id, so they land on the same backend instance
// and can actually reuse each other's cached prefix. Scoped per LESSON, not
// per course: each lesson gets its own freshly-generated header, so a
// lesson's shared prefix (header code, other-scenes context) has nothing in
// common with a sibling lesson's — grouping them under the same session_id
// would just mean more traffic competing for the same cache slot with no
// actual overlap to reuse.
function buildLessonSessionId(courseId, lessonNumber) {
  if (!courseId || !lessonNumber) return null;
  return `lesson-${courseId}-${lessonNumber}`;
}

// Reasoning is OFF (LESSON_CODE_PROVIDER_NO_REASONING below), so these
// budgets only need to cover actual code, not hidden reasoning tokens.
const HEADER_MAX_OUTPUT_TOKENS = Number(process.env.HEADER_MAX_OUTPUT_TOKENS) || 32000;
// How many scenes go in one chunk call — small enough to keep each call's
// failure rate low (matches the historically reliable one-scene-per-call
// pipeline more closely than one giant lesson-wide call), large enough to
// keep total call count down. Starting point, not a derived optimum — tune
// against real observed failure rates.
const LESSON_CHUNK_SCENES = Number(process.env.LESSON_CHUNK_SCENES) || 3;
const CHUNK_MAX_OUTPUT_TOKENS = Number(process.env.CHUNK_MAX_OUTPUT_TOKENS) || 48000;

// ── Course-level component pre-generation ───────────────────────────────────
// Runs ONCE per course, before any lesson starts building (see
// buildLessonsConcurrently in courseController.js — every lesson builds in
// PARALLEL, so this is the only point where something can be guaranteed
// visible to ALL of a course's lessons from the start). This is what makes
// cross-LESSON reuse within one course actually work: the ad-hoc @reusable
// marking during header/chunk generation (see LESSON_HEADER_RULES/
// LESSON_CHUNK_RULES) only discovers a candidate AFTER some lesson already
// built it — too late for that same course's OTHER lessons, which are
// already generating concurrently by then. This step instead looks at the
// WHOLE course up front (topic + every lesson's title/description, already
// known from generateCoursePlan, no scene-plan detail needed) and proposes
// anything a course on this topic will likely need across multiple lessons.
//
// Saved the same way as any other candidate — status "candidate", tagged
// with this sourceCourseId — but getActiveCatalog/getActiveNames/
// getActiveLibrarySource now treat a candidate tagged with the CURRENT
// course as usable immediately (see their own comment in
// globalComponentLibrary.js): free reuse within this course, still gated
// behind admin approval before any OTHER course can see it.
const COURSE_COMPONENTS_MAX_OUTPUT_TOKENS = Number(process.env.COURSE_COMPONENTS_MAX_OUTPUT_TOKENS) || 16000;

const COURSE_COMPONENTS_RULES = `
⚠️ OUTPUT FORMAT: Respond with ONLY raw TypeScript/TSX code (zero or more component declarations, back to back). No prose, no explanation, no markdown fences. If nothing is needed (see below), respond with exactly this one line and nothing else: // NONE NEEDED

You are planning the SHARED VISUAL COMPONENTS for an entire course, before any of its lessons are written. You will be shown the course topic and every lesson's title + description. Your ONLY job: decide whether this course would benefit from any NEW reusable visual component — something multiple DIFFERENT lessons in this course will each need to draw (e.g. a DNA strand for a genetics course, an orbiting body for an astronomy course, a wave for a physics course) — and if so, write it.

RULES:
1. Check the EXISTING LIBRARY CATALOG below FIRST. If something already there covers the need, do NOT redeclare it — that's what lessons will call directly, no action needed from you.
2. Only propose something a HUMAN REVIEWER would agree is genuinely generic and reusable beyond just this one course — not tied to this course's specific subject facts, numbers, or labels. A "DNA double helix" is reusable (any biology course on genetics could use it); "the specific 12-base-pair sequence from lesson 3" is not.
3. Only propose something you're confident MULTIPLE lessons in THIS course will each want — if only one lesson would ever use it, leave it for that lesson to build normally as a scene-local helper instead (do not propose it here).
4. Propose at most 2-3 components. Most courses genuinely need zero or one — do not force it.
5. Each component MUST be self-contained: call its OWN useCurrentFrame() (never assume any outer frame variable exists), and depend on nothing except its own props/params and these already-guaranteed names: PALETTE.bg/.accent/.text, CLAMP, SAFE, ZONES, clampPos, SVG_FRAME. Do NOT declare CLAMP/SAFE/ZONES/clampPos/SVG_FRAME/PALETTE yourself — they already exist wherever this component ends up being used.
6. Wrap any SVG primitives in their own <svg style={SVG_FRAME}>.
7. For EACH component, write exactly these two comment lines immediately above its declaration, then the declaration itself (function ComponentName(...) {...} or const ComponentName = (...) => {...}):
     // @reusable: ComponentName — one-line description of what it does and when to use it
     // @example: <ComponentName someProp={123} otherProp={PALETTE.accent} .../>
   The @example line must be valid, working JSX using only props that component actually accepts — it's used verbatim to preview the component later.

Your entire response is code (or the exact "// NONE NEEDED" line) — no text or fences around it.
`;

function buildCourseComponentsUserContent(topic, lessons, catalog) {
  const lessonTable = lessons
    .map((l, i) => `${i + 1}. ${l.title}${l.description ? " — " + l.description : ""}`)
    .join("\n");
  return `COURSE TOPIC: ${topic}

LESSONS IN THIS COURSE:
${lessonTable}
${buildLibraryCatalogBlock(catalog)}`;
}

async function generateCourseComponents(topic, lessons, { userId = null, courseId = null } = {}) {
  const label = `course-components ${courseId || "?"}`;
  const sessionId = courseId ? `course-components-${courseId}` : null;

  let catalog = [];
  try {
    catalog = await getActiveCatalog(); // global only — this step is what CREATES this course's own entries
  } catch (err) {
    console.warn(`[globalComponentLibrary] Failed to load catalog for ${label} (non-fatal, continuing without it): ${err.message}`);
  }

  try {
    await withRetries(label, 2, async ({ attempt, feedback }) => {
      logVerbose(`  [${label}] Attempt ${attempt}/2...`);

      const { text, stopReason, usage } = await streamCodeCompletion({
        limiter: limitLessonCodeCall,
        provider: LESSON_CODE_PROVIDER_NO_REASONING,
        systemPrompt: COURSE_COMPONENTS_RULES,
        userContent: buildCourseComponentsUserContent(topic, lessons, catalog) + feedbackSuffix(feedback),
        maxOutputTokens: COURSE_COMPONENTS_MAX_OUTPUT_TOKENS,
        sessionId,
      });
      logUsage(label, usage);
      if (usage) {
        recordAiUsage({
          kind: "lesson-code",
          provider: LESSON_CODE_PROVIDER_NO_REASONING.providerName,
          model: LESSON_CODE_PROVIDER_NO_REASONING.model,
          userId,
          courseId,
          // No lessonNumber — this call is course-wide, not scoped to one
          // lesson (see generateCourseComponents's own comment).
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          cachedTokens: usage.prompt_cache_hit_tokens || 0,
          costUsd: usage.cost ?? null,
        });
      }

      try {
        if (stopReason === "length") {
          throw new Error("Course-components output hit max_tokens — was truncated.");
        }
        const code = stripCodeFences(text);
        if (code.includes("NONE NEEDED") || !code.includes("@reusable")) {
          logVerbose(`  [${label}] No course-level components proposed.`);
          return;
        }

        // Validation-only stub: these components never declare CLAMP/PALETTE/
        // etc themselves (rule 5 above) — prepend the same contract block
        // every OTHER active/candidate component already assumes is in
        // scope, purely so validateHeaderFragment's undefined-reference
        // check has something to resolve those names against. Only the
        // MODEL'S OWN declarations get extracted afterward (extractDeclaration
        // is name-targeted), so the stub itself is never saved.
        const libraryNames = catalog.map((c) => c.name);
        const fixed = autoFixCode(code, {});
        const validated = validateHeaderFragment(PREVIEW_HEADER_CONTRACT + "\n" + fixed, {
          reservedNames: [...LESSON_COMPONENT_NAMES, ...libraryNames],
        });

        const candidates = extractReusableCandidates(validated);
        if (candidates.length > 0) {
          await saveCandidates(candidates, { courseId, lessonNumber: null });
          logVerbose(`  [${label}] Proposed ${candidates.length} course-level component(s): ${candidates.map((c) => c.name).join(", ")}`);
        }
      } catch (err) {
        err.isContentError = true;
        throw err;
      }
    }, { keyEnv: LESSON_CODE_PROVIDER_NO_REASONING.keyEnv });
  } catch (err) {
    // Purely additive — a failure here just means this course starts with
    // no pre-generated course-scoped components (lessons still build fully
    // normally, and can still propose/reuse components the ad-hoc way).
    console.warn(`[${label}] Course-level component generation failed (non-fatal): ${err.message}`);
  }
}

// ── Header generation ───────────────────────────────────────────────────────
async function generateLessonHeader(lesson, scenes, maxAttempts = 2, { userId = null, courseId = null } = {}) {
  const label = `header L${lesson.lessonNumber}`;
  const start = Date.now();
  const sessionId = buildLessonSessionId(courseId, lesson.lessonNumber);

  // Fetched ONCE, outside the retry loop — not worth re-querying per
  // attempt, and a fresh header attempt should see the same catalog/
  // reserved-name set as the first. Never fails the header itself: an
  // empty catalog/name list just means no library components get offered
  // or reserved this time, not a broken generation.
  let libraryCatalog = [];
  let libraryNames = [];
  try {
    [libraryCatalog, libraryNames] = await Promise.all([getActiveCatalog(courseId), getActiveNames(courseId)]);
  } catch (err) {
    console.warn(`[globalComponentLibrary] Failed to load catalog for ${label} (non-fatal, continuing without it): ${err.message}`);
  }

  return withRetries(label, maxAttempts, async ({ attempt, feedback }) => {
    logVerbose(`  [${label}] Attempt ${attempt}/${maxAttempts}...`);

    const { text, stopReason, usage } = await streamCodeCompletion({
      limiter: limitLessonCodeCall,
      provider: LESSON_CODE_PROVIDER_NO_REASONING,
      systemPrompt: LESSON_HEADER_RULES,
      userContent: buildHeaderUserContent(lesson, scenes, libraryCatalog) + feedbackSuffix(feedback),
      maxOutputTokens: HEADER_MAX_OUTPUT_TOKENS,
      sessionId,
    });
    logUsage(label, usage);
    if (usage) {
      recordAiUsage({
        kind: "lesson-code",
        provider: LESSON_CODE_PROVIDER_NO_REASONING.providerName,
        model: LESSON_CODE_PROVIDER_NO_REASONING.model,
        userId,
        courseId,
        lessonNumber: lesson.lessonNumber,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        cachedTokens: usage.prompt_cache_hit_tokens || 0,
        costUsd: usage.cost ?? null,
      });
    }

    try {
      if (stopReason === "length") {
        throw new Error("Header hit max_tokens — code was truncated. Generate more compact code.");
      }

      const code = stripCodeFences(text);
      if (!/^(import|const|function|\/\/|\/\*)/.test(code)) {
        throw new Error("Header output wasn't code — you MUST output only TSX code starting with `import`.");
      }

      const fixed = autoFixCode(code, {});
      const validated = validateHeaderFragment(fixed, { reservedNames: [...LESSON_COMPONENT_NAMES, ...libraryNames] });

      // Side effect, fire-and-forget — pulls out any `// @reusable:` marked
      // helper and persists it as a candidate for later admin review. Must
      // never delay or fail the header itself: this header already
      // validated and the lesson is moving on with or without this
      // succeeding.
      try {
        const candidates = extractReusableCandidates(validated);
        if (candidates.length > 0) {
          saveCandidates(candidates, { courseId, lessonNumber: lesson.lessonNumber }).catch((err) => {
            console.warn(`[globalComponentLibrary] Failed to save candidates for ${label} (non-fatal): ${err.message}`);
          });
        }
      } catch (err) {
        console.warn(`[globalComponentLibrary] Failed to extract candidates for ${label} (non-fatal): ${err.message}`);
      }

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      logVerbose(`  [${label}] Valid header generated (${validated.length} chars) — took ${elapsedSec}s`);
      return validated;
    } catch (err) {
      err.isContentError = true;
      throw err;
    }
  }, { keyEnv: LESSON_CODE_PROVIDER_NO_REASONING.keyEnv, stage: "header" });
}

// ── One chunk of scenes ──────────────────────────────────────────────────────
// Sequential, not parallel — each chunk is given every prior chunk's ACTUAL
// generated code as context, so it can reuse a shared graph/array/dataset by
// exact name instead of re-deriving it (this is what keeps cross-scene data
// consistent without needing one giant single-call generation). Own retry
// loop scoped to just this chunk — a syntax slip only costs re-rolling this
// small group of scenes, not the whole lesson.
// Extracts a line number from an error message — every check in
// validateCode.js embeds one, either `at line X, column Y` (Babel's own
// parse errors) or `(line X)` (every one of our own AST checks) — confirmed
// consistent across the whole file.
function extractErrorLine(message) {
  const m = (message || "").match(/at line (\d+)/) || (message || "").match(/\(line (\d+)\)/);
  return m ? Number(m[1]) : null;
}

// Maps a line number back to "which scene" — deliberately TEXT-based, not
// AST-based, specifically because it must also work when the code has a
// genuine parse error and there is no AST at all. Only ever matches against
// THIS chunk's own expectedNames, so a stray identifier elsewhere in an
// error message can't misdirect a patch at the wrong function.
function locateSceneAtLine(chunkCode, targetLine, expectedNames) {
  if (!targetLine) return null;
  const lines = chunkCode.split("\n");
  const markers = [];
  for (const name of expectedNames) {
    const idx = lines.findIndex((l) => l.startsWith(`function ${name}(`) || l.startsWith(`const ${name}`));
    if (idx !== -1) markers.push({ name, startLine: idx + 1 });
  }
  if (markers.length === 0) return null;
  markers.sort((a, b) => a.startLine - b.startLine);

  for (let i = 0; i < markers.length; i++) {
    const endLine = i + 1 < markers.length ? markers[i + 1].startLine - 1 : lines.length;
    if (targetLine >= markers[i].startLine && targetLine <= endLine) {
      return { name: markers[i].name, startLine: markers[i].startLine, endLine };
    }
  }
  return null;
}

// Replaces one scene's line-span with newly patched code — same line-based
// approach as locateSceneAtLine, for the same reason (works even without a
// valid AST for the surrounding, still-broken chunk).
function spliceScene(chunkCode, located, newSceneCode) {
  const lines = chunkCode.split("\n");
  const before = lines.slice(0, located.startLine - 1);
  const after = lines.slice(located.endLine);
  return [...before, newSceneCode.trim(), ...after].join("\n");
}

function buildPatchUserContent(lesson, componentName, targetSceneName, targetScene, brokenChunkCode, errorMessage, headerCode, otherScenesSpec) {
  const m = targetScene.mechanism;
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
${otherScenesSpec ? `
OTHER SCENES IN THIS LESSON (SPEC ONLY, not code — written by a separate parallel call, never assume a name from here is in scope):
${otherScenesSpec}
` : ""}
THIS GROUP OF SCENES WAS GENERATED TOGETHER — every one of them EXCEPT ${targetSceneName} is ALREADY CORRECT. Do not repeat or change them:
\`\`\`tsx
${brokenChunkCode}
\`\`\`

ONLY ${targetSceneName} HAS THIS ERROR — fix it:
${errorMessage}

${targetSceneName}'s spec:
durationInFrames: ${targetScene.durationInFrames}
visualType: ${targetScene.visualType}${targetScene.domainSkill && targetScene.domainSkill !== "none" ? `
domainSkill: ${targetScene.domainSkill}` : ""}
onScreenText (render verbatim): ${targetScene.onScreenText}
${mechanismBlock}
visualDescription: ${targetScene.visualDescription}

Output ONLY the corrected function ${targetSceneName} — nothing else, no other scenes, no fences.
`;
}

// Generates a corrected version of ONE scene, given the specific error and
// the rest of its (otherwise-correct) chunk as context — a patch response IS
// exactly a single-scene fragment, so it's validated with the existing,
// unchanged validateSceneFragment (no new validator needed for this).
async function patchSceneInChunk(lesson, targetSceneName, targetScene, brokenChunkCode, errorMessage, compactHeaderCode, otherScenesSpec, availableNames, componentName, { userId = null, courseId = null } = {}) {
  const label = `patch ${targetSceneName} L${lesson.lessonNumber}`;
  const start = Date.now();

  const { text, stopReason, usage } = await streamCodeCompletion({
    limiter: limitLessonCodeCall,
    provider: LESSON_CODE_PROVIDER_NO_REASONING,
    systemPrompt: LESSON_CHUNK_RULES,
    userContent: buildPatchUserContent(lesson, componentName, targetSceneName, targetScene, brokenChunkCode, errorMessage, compactHeaderCode, otherScenesSpec),
    maxOutputTokens: CHUNK_MAX_OUTPUT_TOKENS,
    sessionId: buildLessonSessionId(courseId, lesson.lessonNumber),
  });
  logUsage(label, usage);
  if (usage) {
    recordAiUsage({
      kind: "lesson-code",
      provider: LESSON_CODE_PROVIDER_NO_REASONING.providerName,
      model: LESSON_CODE_PROVIDER_NO_REASONING.model,
      userId,
      courseId,
      lessonNumber: lesson.lessonNumber,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      cachedTokens: usage.prompt_cache_hit_tokens || 0,
      costUsd: usage.cost ?? null,
    });
  }

  if (stopReason === "length") {
    throw new Error(`Patch for ${targetSceneName} hit max_tokens — truncated.`);
  }

  const code = stripCodeFences(text);
  if (!/^(function|const)\s/.test(code)) {
    throw new Error(`Patch for ${targetSceneName} output wasn't code.`);
  }

  const fixed = autoFixCode(code, { totalFrames: targetScene.durationInFrames });
  const validated = validateSceneFragment(fixed, targetSceneName, { headerAvailableNames: availableNames });

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  logVerbose(`  [${label}] Patched scene generated (${validated.length} chars) — took ${elapsedSec}s`);
  return validated;
}

// ── Post-hoc scene patch: fixes ONE scene in an already-finished, already-
// saved lesson (a real user hit a crash watching it) instead of regenerating
// the whole lesson from scratch — the same cost-saving idea as
// patchSceneInChunk above, but for a lesson whose original per-scene specs
// (visualDescription/mechanism/onScreenText — see the comment on
// sceneMetaSchema in models/Course.js) are long gone. Everything this needs
// is instead derived straight from the lesson's OWN saved code: the header
// portion, the target scene's current (broken) body, and its neighbors — no
// separate stored context required, so this works on any lesson regardless
// of when it was generated. Locates the target scene by NAME (its index is
// already known — from the crash frame or from a compile-error line — by the
// time this is called), the counterpart of locateSceneAtLine's by-LINE
// lookup used at original-generation time.
function locateSceneByIndexInFullCode(fullCode, sceneIndex) {
  const targetName = sceneComponentName(sceneIndex);
  const lines = fullCode.split("\n");
  const markerRe = /^(?:function|const)\s+(Scene\d+)\b/;
  const markers = [];
  lines.forEach((line, i) => {
    const m = line.match(markerRe);
    if (m) markers.push({ name: m[1], startLine: i + 1 });
  });
  // Bounds the LAST scene's span — without this it would swallow the
  // trailing `export const <Lesson> = () => <Series>...` stitched on below
  // every scene (see stitchLessonCode), since that's the only thing after it.
  const exportLine = lines.findIndex((l) => l.startsWith("export const"));
  if (exportLine !== -1) markers.push({ name: "__END__", startLine: exportLine + 1 });
  markers.sort((a, b) => a.startLine - b.startLine);

  const idx = markers.findIndex((mk) => mk.name === targetName);
  if (idx === -1) return null;
  const endLine = idx + 1 < markers.length ? markers[idx + 1].startLine - 1 : lines.length;
  return { name: targetName, startLine: markers[idx].startLine, endLine };
}

// Every scene name actually present in a lesson's saved code, in appearance
// order — used to build the patch prompt's "other scenes" context and to
// bound-check a requested sceneIndex actually exists in THIS lesson.
function extractSceneNamesInOrder(fullCode) {
  const matches = fullCode.matchAll(/^(?:function|const)\s+(Scene\d+)\b/gm);
  return [...matches].map((m) => m[1]);
}

// The by-LINE counterpart of locateSceneByIndexInFullCode above — used when
// the only thing pointing at a scene is a compile error's line number (a
// crash caught by useCompilation.ts client-side, before playback ever
// starts, so there's no frame position to map instead). Same marker-scan
// approach as locateSceneAtLine, just scoped to the FULL saved lesson code
// rather than one generation-time chunk, and returning a scene INDEX
// (0-based) instead of a name, since that's what the retry-scene route and
// patchSceneFromRuntimeError both key on.
function locateSceneIndexAtLineInFullCode(fullCode, targetLine) {
  if (!targetLine) return null;
  const sceneNames = extractSceneNamesInOrder(fullCode);
  if (sceneNames.length === 0) return null;
  for (let i = 0; i < sceneNames.length; i++) {
    const located = locateSceneByIndexInFullCode(fullCode, i);
    if (located && targetLine >= located.startLine && targetLine <= located.endLine) return i;
  }
  return null;
}

// The header is simply everything before the first scene function — exactly
// what stitchLessonCode concatenated in the first place (see its own
// `header.trim() + "" + chunkCodes...`).
function extractHeaderFromFullCode(fullCode, sceneNames) {
  if (sceneNames.length === 0) return fullCode;
  const firstSceneName = sceneNames[0];
  const idx = fullCode.search(new RegExp(`^(?:function|const)\\s+${firstSceneName}\\b`, "m"));
  return idx === -1 ? fullCode : fullCode.slice(0, idx);
}

// The line-span counterpart of extractHeaderFromFullCode above — needed (not
// just the text) so a header patch can be spliced back in with the same
// line-based spliceScene every other patch path uses. The header always
// starts at line 1; it ends the line before the first scene function starts.
function locateHeaderInFullCode(fullCode) {
  const firstScene = locateSceneByIndexInFullCode(fullCode, 0);
  if (!firstScene) return null;
  return { name: "__HEADER__", startLine: 1, endLine: firstScene.startLine - 1 };
}

// A compile error's line number can land in the header just as easily as in
// a scene — a broken shared component (Backdrop, Arrow, a bad PALETTE
// value) throws from wherever a scene happens to call it, but the actual
// bug lives in the header's own code above every scene. Checked BEFORE
// falling through to locateSceneIndexAtLineInFullCode in the caller, so a
// header bug gets a header-scoped patch instead of a scene patch that has
// nothing wrong in it to find.
function locateErrorIsInHeader(fullCode, targetLine) {
  if (!targetLine) return false;
  const header = locateHeaderInFullCode(fullCode);
  return Boolean(header && targetLine >= header.startLine && targetLine <= header.endLine);
}

// Last-resort location strategy — used whenever there's no crash frame (a
// compile-time crash, caught before playback ever starts) AND no usable
// line number either. That second case is actually the COMMON one for a
// compile-time error, not the exception: useCompilation.ts only ever keeps
// `err.message`, never a line number, and even if it did, that line would
// point into a Babel-transpiled, import-stripped, prelude-prepended COPY of
// the code — not reliably mappable back to a line in lesson.code at all. So
// extractErrorLine/locateErrorIsInHeader/locateSceneIndexAtLineInFullCode
// above are of little use for exactly the error class this exists to catch
// ("SomeName is not defined" / "SomeName is not a function") — a plain
// browser ReferenceError/TypeError message with no position info in the
// text, ever.
//
// Instead: these error shapes are extremely standardized (every JS engine
// phrases them identically) and name the missing identifier directly.
// Search the lesson's OWN code for where that exact token is referenced —
// if it's used in exactly one place (one scene, or the header), that's
// almost certainly where the fix belongs, whether or not it's the literal
// line that threw.
const UNDEFINED_IDENTIFIER_PATTERNS = [
  /^(\w+) is not defined$/,        // Chrome/V8, Firefox
  /^(\w+) is not a function$/,     // all engines
  /^Can't find variable: (\w+)$/,  // Safari's ReferenceError phrasing
];
function extractUndefinedIdentifier(errorMessage) {
  for (const pattern of UNDEFINED_IDENTIFIER_PATTERNS) {
    const m = (errorMessage || "").trim().match(pattern);
    if (m) return m[1];
  }
  return null;
}

// Returns { type: "header" } | { type: "scene", index } when `identifier`
// appears (as a whole word) in EXACTLY one place across the header and every
// scene — anything else (not found anywhere, or referenced in more than one
// place, e.g. a common local variable name that's coincidentally reused
// across scenes) is too ambiguous to safely target, and the caller falls
// back to a full lesson retry rather than risk patching the wrong spot.
function locateIdentifierScope(fullCode, identifier) {
  const wordRe = new RegExp(`\\b${identifier}\\b`);
  const matches = [];

  const header = locateHeaderInFullCode(fullCode);
  if (header) {
    const headerCode = fullCode.split("\n").slice(header.startLine - 1, header.endLine).join("\n");
    if (wordRe.test(headerCode)) matches.push({ type: "header" });
  }

  const sceneNames = extractSceneNamesInOrder(fullCode);
  sceneNames.forEach((_, i) => {
    const located = locateSceneByIndexInFullCode(fullCode, i);
    if (!located) return;
    const sceneCode = fullCode.split("\n").slice(located.startLine - 1, located.endLine).join("\n");
    if (wordRe.test(sceneCode)) matches.push({ type: "scene", index: i });
  });

  return matches.length === 1 ? matches[0] : null;
}

// Pulls durationInFrames for one scene straight out of the stitcher's own
// <Series.Sequence durationInFrames={N}>...<SceneN /> block — the same
// number stitchLessonCode wrote there originally, so this is always exactly
// right regardless of whether lesson.scenes (DB metadata) is populated.
function extractSceneDurationFromFullCode(fullCode, sceneName) {
  const re = new RegExp(
    `<Series\\.Sequence durationInFrames=\\{(\\d+)\\}>[\\s\\S]*?<${sceneName}\\s*/>`
  );
  const m = fullCode.match(re);
  return m ? Number(m[1]) : null;
}

// Delimiters for the find/replace format below — distinctive enough that
// they'll never collide with anything a real scene would contain.
const PATCH_FIND_MARKER = "<<<FIND>>>";
const PATCH_REPLACE_MARKER = "<<<REPLACE>>>";
const PATCH_END_MARKER = "<<<END>>>";

function buildRuntimePatchUserContent(lesson, componentName, targetSceneName, currentSceneCode, errorMessage, headerCode, otherSceneNames, feedback) {
  return `
LESSON: ${lesson.title} (component ${componentName})

This lesson already finished generating and a real user hit an error watching it. You are making a SURGICAL fix to ONE scene in an otherwise-working, already-shipped lesson — find the exact line(s) actually causing this error and change ONLY those. Do not rewrite, restyle, or "improve" anything else in the scene, even if you'd do it differently — every untouched line must come out byte-for-byte identical to what's below.

HEADER CODE (already imported/declared — reference these exact names, do not redeclare or reimport):
\`\`\`tsx
${headerCode}
\`\`\`

OTHER SCENES IN THIS LESSON (already correct, not shown — do not repeat them, do not rename anything): ${otherSceneNames.filter((n) => n !== targetSceneName).join(", ") || "none"}

${targetSceneName}'S CURRENT CODE (line-numbered for reference only — do not include the numbers in your output):
${currentSceneCode.split("\n").map((l, i) => `${i + 1}| ${l}`).join("\n")}

THE ERROR THIS SCENE PRODUCES:
${errorMessage}

Output ONE find/replace block for each spot that needs to change (usually just one), in EXACTLY this format and nothing else — no explanation, no code fences, no other scenes, no restating the whole function:

${PATCH_FIND_MARKER}
<the EXACT original snippet to replace, copied character-for-character from the code above — no line numbers, exact whitespace/indentation, just enough surrounding lines to be unambiguous (matched only once in the scene)>
${PATCH_REPLACE_MARKER}
<the corrected replacement for exactly that snippet — nothing more>
${PATCH_END_MARKER}
${feedback ? `\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${feedback}"\nMake sure the FIND text is an exact, unique, verbatim copy from the code above this time.` : ""}
`;
}

// Parses one or more ${PATCH_FIND_MARKER}/${PATCH_REPLACE_MARKER}/${PATCH_END_MARKER}
// blocks out of the model's response.
function parsePatchBlocks(text) {
  const re = new RegExp(
    `${PATCH_FIND_MARKER}\\n([\\s\\S]*?)\\n${PATCH_REPLACE_MARKER}\\n([\\s\\S]*?)\\n${PATCH_END_MARKER}`,
    "g"
  );
  const blocks = [...text.matchAll(re)].map((m) => ({ find: m[1], replace: m[2] }));
  return blocks;
}

// Applies every find/replace block to sceneCode, IN ORDER, failing loudly
// (rather than guessing) the moment any `find` isn't a unique, verbatim
// substring — an ambiguous or missing match means the model didn't actually
// copy the snippet exactly, which is exactly the failure mode this format
// exists to catch instead of silently patching the wrong spot.
function applyPatchBlocks(sceneCode, blocks) {
  let result = sceneCode;
  for (const { find, replace } of blocks) {
    const occurrences = result.split(find).length - 1;
    if (occurrences === 0) {
      throw new Error(`Patch FIND text was not found verbatim in the scene's current code:\n${find}`);
    }
    if (occurrences > 1) {
      throw new Error(`Patch FIND text matches ${occurrences} places in the scene — it must uniquely identify one spot:\n${find}`);
    }
    result = result.replace(find, replace);
  }
  return result;
}

// Fixes ONE scene in an already-generated, already-saved lesson with a
// targeted find/replace patch, given the scene's own current (broken) code
// and the actual error it produced — either a runtime crash caught while a
// real user was playing it (error message + which frame it happened on,
// resolved to a scene index by the caller) or a compile error whose line
// number pointed into this scene (also resolved by the caller).
//
// Deliberately NOT "regenerate the whole scene" (that's patchSceneInChunk's
// job, at GENERATION time, where the scene has no user-visible history yet)
// — a scene a real viewer has already watched should come back changed in
// exactly the one place that broke, not rewritten wholesale by the model's
// own judgment of how it "should" look. The model is asked for one or more
// find/replace snippets (see PATCH_FIND_MARKER et al.) instead of a full
// function body; those get applied as literal substring replacements
// against the scene's OWN current code, so anything the model doesn't
// explicitly target is guaranteed byte-identical to before, not just
// "hopefully preserved" by the model.
//
// Returns the FULL lesson code with just that one scene's span replaced —
// everything else (header, other scenes, the <Series> wrapper, every audio
// URL and duration) is untouched, spliced back in with the same line-based
// spliceScene used by the generation-time patch path above.
async function patchSceneFromRuntimeError(lesson, componentName, fullCode, sceneIndex, errorMessage, { userId = null, courseId = null, maxAttempts = 2 } = {}) {
  const sceneNames = extractSceneNamesInOrder(fullCode);
  const targetSceneName = sceneComponentName(sceneIndex);
  if (!sceneNames.includes(targetSceneName)) {
    throw new Error(`Scene ${targetSceneName} not found in this lesson's code`);
  }

  const located = locateSceneByIndexInFullCode(fullCode, sceneIndex);
  if (!located) {
    throw new Error(`Could not locate ${targetSceneName}'s code span`);
  }

  const currentSceneCode = fullCode.split("\n").slice(located.startLine - 1, located.endLine).join("\n");
  const headerCode = extractHeaderFromFullCode(fullCode, sceneNames);
  const headerAvailableNames = new Set(getHeaderExposedNames(headerCode));
  const durationInFrames = extractSceneDurationFromFullCode(fullCode, targetSceneName)
    ?? lesson.scenes?.find((s) => s.index === sceneIndex)?.endFrame - (lesson.scenes?.find((s) => s.index === sceneIndex)?.startFrame ?? 0)
    ?? undefined;

  const label = `runtime-patch ${targetSceneName} L${lesson.lessonNumber}`;
  const start = Date.now();
  // Distinct from the original generation's session_id (a "-patch" suffix)
  // — this is a real user hitting a crash, potentially long after the
  // lesson originally generated, so there's no live cache from that first
  // pass left to reuse anyway. What DOES help: this function's OWN retry
  // loop below resends the identical header/scene-code context on attempt
  // 2 — sharing one session_id across those attempts is what lets that
  // repeat be cached.
  const baseSessionId = buildLessonSessionId(courseId, lesson.lessonNumber);
  const sessionId = baseSessionId ? `${baseSessionId}-patch` : null;

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { text, stopReason, usage } = await streamCodeCompletion({
        limiter: limitLessonCodeCall,
        provider: LESSON_CODE_PROVIDER_NO_REASONING,
        systemPrompt: LESSON_CHUNK_RULES,
        userContent: buildRuntimePatchUserContent(
          lesson, componentName, targetSceneName, currentSceneCode, errorMessage, headerCode, sceneNames,
          attempt > 1 ? lastErr?.message : null
        ),
        maxOutputTokens: CHUNK_MAX_OUTPUT_TOKENS,
        sessionId,
      });
      logUsage(label, usage);
      if (usage) {
        recordAiUsage({
          kind: "lesson-code",
          provider: LESSON_CODE_PROVIDER_NO_REASONING.providerName,
          model: LESSON_CODE_PROVIDER_NO_REASONING.model,
          userId,
          courseId,
          lessonNumber: lesson.lessonNumber,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          cachedTokens: usage.prompt_cache_hit_tokens || 0,
          costUsd: usage.cost ?? null,
        });
      }

      if (stopReason === "length") {
        throw new Error(`Runtime patch for ${targetSceneName} hit max_tokens — truncated.`);
      }

      const blocks = parsePatchBlocks(text);
      if (blocks.length === 0) {
        throw new Error(`Runtime patch for ${targetSceneName} did not contain any ${PATCH_FIND_MARKER}/${PATCH_REPLACE_MARKER} block.`);
      }

      const patchedSceneCode = applyPatchBlocks(currentSceneCode, blocks);
      const fixed = autoFixCode(patchedSceneCode, { totalFrames: durationInFrames });
      const validated = validateSceneFragment(fixed, targetSceneName, { headerAvailableNames });

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      logVerbose(`  [${label}] Patched via ${blocks.length} targeted edit(s) (${validated.length} chars) — took ${elapsedSec}s`);
      return spliceScene(fullCode, located, validated);
    } catch (err) {
      lastErr = err;
      console.warn(`  [${label}] Attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
    }
  }
  throw lastErr ?? new Error(`Runtime patch for ${targetSceneName} failed after ${maxAttempts} attempts`);
}

function buildHeaderRuntimePatchUserContent(lesson, componentName, currentHeaderCode, errorMessage, sceneNames, feedback) {
  return `
LESSON: ${lesson.title} (component ${componentName})

This lesson already finished generating and a real user hit an error watching it. The bug is in the HEADER — the shared imports/constants/components (e.g. PALETTE, Backdrop, Arrow) every scene in this lesson calls — NOT in any individual scene. You are making a SURGICAL fix: find the exact line(s) actually causing this error and change ONLY those. Do not rewrite, restyle, or "improve" anything else, even if you'd do it differently — every untouched line must come out byte-for-byte identical to what's below. In particular, do NOT rename, remove, or change the signature of anything the scenes below already depend on unless that is ITSELF the bug — every one of these scenes calls into this header and would break if a name it relies on disappeared or changed shape.

SCENES THAT CALL INTO THIS HEADER (not shown, already correct — do not repeat them): ${sceneNames.join(", ") || "none"}

CURRENT HEADER CODE (line-numbered for reference only — do not include the numbers in your output):
${currentHeaderCode.split("\n").map((l, i) => `${i + 1}| ${l}`).join("\n")}

THE ERROR THIS PRODUCES:
${errorMessage}

Output ONE find/replace block for each spot that needs to change (usually just one), in EXACTLY this format and nothing else — no explanation, no code fences, no scenes:

${PATCH_FIND_MARKER}
<the EXACT original snippet to replace, copied character-for-character from the code above — no line numbers, exact whitespace/indentation, just enough surrounding lines to be unambiguous (matched only once)>
${PATCH_REPLACE_MARKER}
<the corrected replacement for exactly that snippet — nothing more>
${PATCH_END_MARKER}
${feedback ? `\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${feedback}"\nMake sure the FIND text is an exact, unique, verbatim copy from the code above this time.` : ""}
`;
}

// The header counterpart of patchSceneFromRuntimeError above — same
// surgical find/replace approach (see that function's own comment for the
// full rationale), scoped to the header instead of one scene. Higher blast
// radius than a scene patch by nature (every scene calls into the header),
// which is exactly why the prompt above is explicit about not touching
// anything the scenes depend on beyond the actual bug — the find/replace
// format's own guarantee (untouched code comes back byte-identical) is what
// keeps that risk bounded rather than eliminated.
async function patchHeaderFromRuntimeError(lesson, componentName, fullCode, errorMessage, { userId = null, courseId = null, maxAttempts = 2 } = {}) {
  const sceneNames = extractSceneNamesInOrder(fullCode);
  const located = locateHeaderInFullCode(fullCode);
  if (!located) {
    throw new Error("Could not locate this lesson's header code span");
  }

  const currentHeaderCode = fullCode.split("\n").slice(located.startLine - 1, located.endLine).join("\n");
  const label = `runtime-patch header L${lesson.lessonNumber}`;
  const start = Date.now();
  // See the identical comment on patchSceneFromRuntimeError's sessionId —
  // same "-patch" suffix convention, same reason (shares a session_id
  // across THIS function's own retry attempts, not with the original
  // generation).
  const baseSessionId = buildLessonSessionId(courseId, lesson.lessonNumber);
  const sessionId = baseSessionId ? `${baseSessionId}-patch` : null;

  // A patch can still introduce a NEW helper the header didn't have before
  // — reserve active library names here too so it can't collide with one.
  let libraryNames = [];
  try {
    libraryNames = await getActiveNames(courseId);
  } catch (err) {
    console.warn(`[globalComponentLibrary] Failed to load names for ${label} (non-fatal): ${err.message}`);
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { text, stopReason, usage } = await streamCodeCompletion({
        limiter: limitLessonCodeCall,
        provider: LESSON_CODE_PROVIDER_NO_REASONING,
        systemPrompt: LESSON_HEADER_RULES,
        userContent: buildHeaderRuntimePatchUserContent(
          lesson, componentName, currentHeaderCode, errorMessage, sceneNames,
          attempt > 1 ? lastErr?.message : null
        ),
        maxOutputTokens: HEADER_MAX_OUTPUT_TOKENS,
        sessionId,
      });
      logUsage(label, usage);
      if (usage) {
        recordAiUsage({
          kind: "lesson-code",
          provider: LESSON_CODE_PROVIDER_NO_REASONING.providerName,
          model: LESSON_CODE_PROVIDER_NO_REASONING.model,
          userId,
          courseId,
          lessonNumber: lesson.lessonNumber,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          cachedTokens: usage.prompt_cache_hit_tokens || 0,
          costUsd: usage.cost ?? null,
        });
      }

      if (stopReason === "length") {
        throw new Error("Runtime header patch hit max_tokens — truncated.");
      }

      const blocks = parsePatchBlocks(text);
      if (blocks.length === 0) {
        throw new Error(`Runtime header patch did not contain any ${PATCH_FIND_MARKER}/${PATCH_REPLACE_MARKER} block.`);
      }

      const patchedHeaderCode = applyPatchBlocks(currentHeaderCode, blocks);
      const fixed = autoFixCode(patchedHeaderCode, {});
      const validated = validateHeaderFragment(fixed, { reservedNames: [...LESSON_COMPONENT_NAMES, ...libraryNames] });

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      logVerbose(`  [${label}] Patched via ${blocks.length} targeted edit(s) (${validated.length} chars) — took ${elapsedSec}s`);
      return spliceScene(fullCode, located, validated);
    } catch (err) {
      lastErr = err;
      console.warn(`  [${label}] Attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
    }
  }
  throw lastErr ?? new Error(`Runtime header patch failed after ${maxAttempts} attempts`);
}

// `allScenes` is the FULL lesson's scene list (specs only, for the
// OTHER-SCENES context) — not this chunk's own scenes, and never another
// chunk's actual generated code. Chunks now run in PARALLEL (see
// generateLessonCode below), so no chunk can see any other chunk's output at
// generation time.
async function generateSceneChunk(lesson, chunkScenes, chunkStartIndex, totalScenes, headerCode, allScenes, availableNames, componentName, maxAttempts = 3, { userId = null, courseId = null } = {}) {
  const chunkLabel = chunkScenes.length > 1
    ? `${chunkStartIndex + 1}-${chunkStartIndex + chunkScenes.length}`
    : `${chunkStartIndex + 1}`;
  const label = `chunk ${chunkLabel} L${lesson.lessonNumber}`;
  const start = Date.now();
  const expectedNames = chunkScenes.map((_, i) => sceneComponentName(chunkStartIndex + i));
  const sessionId = buildLessonSessionId(courseId, lesson.lessonNumber);

  // compactHeaderForPrompt strips shared-component BODIES the same way it
  // already does for the split-pipeline's header — a chunk never needs to
  // know HOW Backdrop/Arrow animate internally, only their names/params.
  const compactHeader = compactHeaderForPrompt(headerCode);
  const otherScenesSpec = buildOtherScenesSpecTable(allScenes, chunkStartIndex, chunkScenes.length);

  async function generateFullChunk(feedback) {
    const { text, stopReason, usage } = await streamCodeCompletion({
      limiter: limitLessonCodeCall,
      provider: LESSON_CODE_PROVIDER_NO_REASONING,
      systemPrompt: LESSON_CHUNK_RULES,
      userContent: buildChunkUserContent(lesson, componentName, chunkScenes, chunkStartIndex, totalScenes, compactHeader, allScenes) + feedbackSuffix(feedback),
      maxOutputTokens: CHUNK_MAX_OUTPUT_TOKENS,
      sessionId,
    });
    logUsage(label, usage);
    if (usage) {
      recordAiUsage({
        kind: "lesson-code",
        provider: LESSON_CODE_PROVIDER_NO_REASONING.providerName,
        model: LESSON_CODE_PROVIDER_NO_REASONING.model,
        userId,
        courseId,
        lessonNumber: lesson.lessonNumber,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        cachedTokens: usage.prompt_cache_hit_tokens || 0,
        costUsd: usage.cost ?? null,
      });
    }

    try {
      if (stopReason === "length") {
        throw new Error(`Chunk ${chunkLabel} hit max_tokens — code was truncated. Generate more compact code.`);
      }
      const code = stripCodeFences(text);
      if (!/^(function|const)\s/.test(code)) {
        throw new Error(`Chunk ${chunkLabel} output wasn't code — you MUST output only scene function declarations.`);
      }
      return code;
    } catch (err) {
      err.isContentError = true;
      throw err;
    }
  }

  function validateChunk(rawCode) {
    try {
      const chunkTotalFrames = chunkScenes.reduce((sum, s) => sum + s.durationInFrames, 0);
      const fixed = autoFixCode(rawCode, { totalFrames: chunkTotalFrames });
      return validateChunkFragment(fixed, expectedNames, { availableNames });
    } catch (err) {
      err.isContentError = true;
      throw err;
    }
  }

  let lastError = null;
  let lastRawCode = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let rawCode = null;
      let patched = false;

      // TARGETED PATCH instead of a full regeneration when the previous
      // failure can be confidently pinned to ONE scene — a pure cost
      // optimization on top of full-chunk regeneration, never a replacement
      // for it: any uncertainty here falls straight through to the normal
      // full regeneration below, so correctness never depends on this path
      // working.
      if (attempt > 1 && lastError?.isContentError && lastRawCode) {
        const errLine = extractErrorLine(lastError.message);
        const located = errLine ? locateSceneAtLine(lastRawCode, errLine, expectedNames) : null;
        if (located) {
          try {
            logVerbose(`  [${label}] Attempt ${attempt}/${maxAttempts} — targeted patch for ${located.name} (localized to line ${errLine})...`);
            const targetIndex = expectedNames.indexOf(located.name);
            const patchedScene = await patchSceneInChunk(
              lesson, located.name, chunkScenes[targetIndex], lastRawCode, lastError.message,
              compactHeader, otherScenesSpec, availableNames, componentName, { userId, courseId }
            );
            rawCode = spliceScene(lastRawCode, located, patchedScene);
            patched = true;
          } catch (patchErr) {
            console.warn(`  [${label}] Targeted patch failed (${describeError(patchErr)}) — falling back to full regeneration.`);
          }
        }
      }

      if (!patched) {
        logVerbose(`  [${label}] Attempt ${attempt}/${maxAttempts}${attempt > 1 ? " (full regeneration)" : ""}...`);
        rawCode = await generateFullChunk(lastError?.isContentError ? lastError.message : null);
      }

      lastRawCode = rawCode;
      const validated = validateChunk(rawCode);

      // Same fire-and-forget candidate extraction as generateLessonHeader,
      // just scoped to scene-local helpers instead of header-level ones —
      // most of a lesson's actual visual work happens here, in the scenes,
      // not the header, so this is where a genuinely-generic one-off (a DNA
      // strand, a particle, an orbit) is actually likely to get proposed.
      // Never delays or fails the chunk: it already validated and is moving
      // on with or without this succeeding.
      try {
        const candidates = extractReusableCandidates(validated);
        if (candidates.length > 0) {
          saveCandidates(candidates, { courseId, lessonNumber: lesson.lessonNumber }).catch((err) => {
            console.warn(`[globalComponentLibrary] Failed to save candidates for ${label} (non-fatal): ${err.message}`);
          });
        }
      } catch (err) {
        console.warn(`[globalComponentLibrary] Failed to extract candidates for ${label} (non-fatal): ${err.message}`);
      }

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      logVerbose(`  [${label}] Valid code generated (${validated.length} chars)${patched ? " via targeted patch" : ""} — took ${elapsedSec}s`);
      return validated;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Chunk ${chunkLabel} failed with a non-retryable error (check ${LESSON_CODE_PROVIDER_NO_REASONING.keyEnv}): ${describeError(err)}`);
      }
      console.warn(`  [${label}] Attempt ${attempt}/${maxAttempts} failed: ${describeError(err)}. Retrying...`);
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(`Chunk ${chunkLabel} failed after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`);
}

// ── Deterministic stitcher ──────────────────────────────────────────────────
// Non-LLM assembly: header + every chunk's scene functions + a <Series>
// wrapper built directly from known scene metadata (durationInFrames,
// audioUrl) — never transcribed by the model, so a duration-sum drift or a
// mistyped audio URL is structurally impossible on this path.
function stitchLessonCode({ header, chunkCodes, scenes, componentName }) {
  const sequences = scenes
    .map((s, i) => {
      const name = sceneComponentName(i);
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
    chunkCodes.map((c) => c.trim()).join("\n\n"),
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

// ── Full-lesson orchestration: header, then sequential scene chunks, then a
// deterministic stitch ───────────────────────────────────────────────────────
// `headerPromise` (optional): the caller may kick off generateLessonHeader
// EARLY — it only reads visualType/onScreenText/mechanism/visualDescription,
// never durationInFrames/audioUrl, so it doesn't actually need to wait for
// scene audio to finish measuring like the chunk calls do. When provided, it's
// used ONLY on the very first attempt (so it overlaps with audio synthesis in
// the common no-retry case); any retry generates a fresh header as before,
// since a caller-supplied promise can't be "re-rolled" after the fact.
// Header is generated ONCE, outside the retry loop below — it has its own
// internal retry (generateLessonHeader's maxAttempts=2), so a downstream
// chunk failure is never a reason to pay for a fresh header call too.
// Similarly, a chunk that already validated successfully is never
// regenerated again on a later outer attempt just because a SIBLING chunk
// failed — chunkCodes[i] is filled in exactly once, the first time chunk i
// succeeds, and every retry only re-requests the chunks still missing.
// (This replaces an earlier version that discarded the header AND every
// already-succeeded chunk on ANY single chunk failure, regenerating the
// whole lesson from scratch — measured to roughly double total code-gen
// wall-clock time on a lesson where only one chunk out of four needed a
// second try.)
async function generateLessonCode(lesson, componentName, scenes, totalFrames, maxAttempts = 3, { userId = null, courseId = null, headerPromise = null, onChunkReady = null } = {}) {
  const lessonStart = Date.now();

  const generatedHeader = headerPromise
    ? await headerPromise
    : await generateLessonHeader(lesson, scenes, undefined, { userId, courseId });

  // Same splice as the hand-written library below, for the ACTIVE (admin-
  // approved) global library — fetched fresh here rather than threaded
  // through from generateLessonHeader's own catalog fetch, since that one
  // only needed names+descriptions for the prompt; this needs the actual
  // code, for runtime injection. activeLibraryNames is kept for the
  // usage-tracking call once this lesson's final code exists (see below).
  let activeLibrarySource = "";
  let activeLibraryNames = [];
  try {
    [activeLibrarySource, activeLibraryNames] = await Promise.all([getActiveLibrarySource(courseId), getActiveNames(courseId)]);
  } catch (err) {
    console.warn(`[globalComponentLibrary] Failed to load active library for L${lesson.lessonNumber} (non-fatal): ${err.message}`);
  }

  // Append the hand-written component library (never LLM-generated) AND
  // the dynamic, admin-approved one to the header text AFTER validation,
  // before computing exposed names — this one splice makes both
  // automatically visible to every chunk's availableNames AND automatically
  // shown (signature-only, via compactHeaderForPrompt below) in every
  // chunk's prompt, with no other plumbing needed.
  const header = generatedHeader + "\n\n" + LESSON_COMPONENT_LIBRARY_SOURCE + activeLibrarySource;
  const headerAvailableNames = new Set(getHeaderExposedNames(header));

  // Chunks run IN PARALLEL, not sequentially — the old design awaited
  // each chunk in turn so the NEXT one could see every prior chunk's
  // ACTUAL code (byte-for-byte shared data, accumulated availableNames).
  // That gave perfect cross-scene consistency but made total chunk time
  // additive (measured ~90% of a lesson's code-gen wall-clock time, at a
  // fixed ~75 tok/s GLM throughput no amount of re-chunking changes).
  // Firing every chunk at once cuts that to roughly the SLOWEST single
  // chunk's time instead of the sum of all of them. The trade: each
  // chunk only gets the header + a SPEC-only (not code) table of every
  // OTHER scene (see buildOtherScenesSpecTable / the "chunks generate IN
  // PARALLEL now" rule in LESSON_CHUNK_RULES) — occasional cross-chunk
  // data drift (two chunks independently deriving slightly different
  // values for what's meant to be the same example) is the accepted
  // cost, per explicit product decision. A same-named top-level const
  // declared independently by two DIFFERENT chunks (rule 1a is now only
  // safe WITHIN a chunk) would collide once stitched together — that
  // surfaces as a real Babel "already been declared" parse error in
  // validateGeneratedCode below, which triggers the ALL-chunks fallback in
  // the critic-rejection branch further down (the one case where we can't
  // attribute the failure to a single chunk).
  //
  // Each chunk gets its OWN copy of availableNames (header names only) —
  // a shared mutable Set across concurrent chunks would be a race (and
  // semantically wrong: no chunk can actually see another's names at
  // generation time, so validation must not pretend otherwise).
  const chunkGroups = [];
  for (let start = 0; start < scenes.length; start += LESSON_CHUNK_SCENES) {
    chunkGroups.push({ chunkScenes: scenes.slice(start, start + LESSON_CHUNK_SCENES), start });
  }

  const chunkCodes = new Array(chunkGroups.length).fill(null);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pending = chunkGroups
      .map((group, i) => ({ ...group, i }))
      .filter(({ i }) => chunkCodes[i] === null);

    if (pending.length === 0) break;

    console.log(
      `  [code L${lesson.lessonNumber}] Outer attempt ${attempt}/${maxAttempts} for ${componentName} — ` +
      `${pending.length}/${chunkGroups.length} chunk(s) to (re)generate...`
    );

    const results = await Promise.allSettled(
      pending.map(({ chunkScenes, start }) =>
        generateSceneChunk(
          lesson, chunkScenes, start, scenes.length, header, scenes,
          new Set(headerAvailableNames), componentName, undefined, { userId, courseId }
        ).then((value) => {
          // Fire-and-forget, attached to THIS chunk's own promise — not
          // after the surrounding Promise.allSettled resolves. allSettled
          // only resolves once EVERY chunk in the batch has settled, so
          // firing there means a fast chunk's tick waits on the slowest
          // sibling in the same batch instead of appearing the instant IT
          // validates — exactly the bug this fixes. A progress-UI write
          // failing must never fail the actual code generation it's just
          // reporting on, hence the try/catch. Fires on raw generation
          // success, not the whole lesson's later critic review — see the
          // onChunkReady call in the critic-rejection retry loop below for
          // why that's an accepted, deliberate trade (a rare re-fire, not a
          // correctness issue).
          if (onChunkReady) {
            try { onChunkReady(start, chunkScenes.length); } catch (_) {}
          }
          return value;
        })
      )
    );

    for (let idx = 0; idx < results.length; idx++) {
      const result = results[idx];
      const { i } = pending[idx];
      if (result.status === "fulfilled") {
        chunkCodes[i] = result.value;
      } else {
        lastError = result.reason;
        if (isNonRetryable(result.reason)) {
          throw new Error(
            `Lesson code generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER_NO_REASONING.keyEnv}): ${describeError(result.reason)}`
          );
        }
      }
    }

    if (chunkCodes.every((c) => c !== null)) break;

    const stillMissing = chunkCodes.filter((c) => c === null).length;
    console.warn(
      `  [code L${lesson.lessonNumber}] Outer attempt ${attempt} left ${stillMissing} chunk(s) failed: ${describeError(lastError)}. Retrying only those...`
    );
    if (attempt < maxAttempts) await backoffDelay(attempt);
  }

  if (chunkCodes.some((c) => c === null)) {
    const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
    const e = new Error(
      `Failed to generate valid lesson code after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${lastError ? describeError(lastError) : "unknown error"}`
    );
    e.stage = lastError?.stage || "code";
    throw e;
  }

  // The critic reviews the WHOLE stitched lesson, so a rejection here can't
  // be attributed to one chunk the way a validation failure can — fall back
  // to regenerating every chunk (header stays fixed; the same fixed header
  // was never implicated in a chunk-level failure either).
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const stitched = stitchLessonCode({ header, chunkCodes, scenes, componentName });
    const validatedCode = validateGeneratedCode(stitched, componentName, totalFrames);

    const review = await reviewGeneratedCode(validatedCode, lesson);
    if (review.skipped || review.ok !== false) {
      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      console.log(
        `  [code L${lesson.lessonNumber}] Valid code generated (${validatedCode.length} chars) — took ${elapsedSec}s for ${componentName}`
      );
      // One cheap regex pass over the FINAL code, once, fire-and-forget —
      // bumps usageCount only for library components this lesson actually
      // called, not just ones it had available. See globalComponentLibrary's
      // own comment on why this is deliberately this cheap.
      trackLibraryUsage(validatedCode, activeLibraryNames).catch((err) => {
        console.warn(`[globalComponentLibrary] Failed to track usage for L${lesson.lessonNumber} (non-fatal): ${err.message}`);
      });
      return { code: validatedCode, totalFrames };
    }

    console.warn(
      `  [code L${lesson.lessonNumber}] Code critic flagged issues on attempt ${attempt}/${maxAttempts}: ${review.issues?.join("; ") || "unspecified"} — regenerating all chunks...`
    );
    if (attempt === maxAttempts) {
      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      const e = new Error(
        `Code critic flagged issues after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${review.issues?.join("; ") || "unspecified"}`
      );
      e.stage = "code";
      throw e;
    }

    chunkCodes.fill(null);
    const results = await Promise.allSettled(
      chunkGroups.map(({ chunkScenes, start }) =>
        generateSceneChunk(
          lesson, chunkScenes, start, scenes.length, header, scenes,
          new Set(headerAvailableNames), componentName, undefined, { userId, courseId }
        ).then((value) => {
          // Same fix as the pending-chunks loop above — attached to THIS
          // chunk's own promise so it fires the instant IT validates, not
          // after every chunk in the regeneration batch has settled.
          if (onChunkReady) {
            try { onChunkReady(start, chunkScenes.length); } catch (_) {}
          }
          return value;
        })
      )
    );
    const firstFailure = results.find((r) => r.status === "rejected");
    if (firstFailure) {
      if (isNonRetryable(firstFailure.reason)) {
        throw new Error(
          `Lesson code generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER_NO_REASONING.keyEnv}): ${describeError(firstFailure.reason)}`
        );
      }
      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      const e = new Error(
        `Failed to regenerate chunks after a code critic rejection (${elapsedSec}s elapsed): ${describeError(firstFailure.reason)}`
      );
      e.stage = "code";
      throw e;
    }
    results.forEach((r, i) => { chunkCodes[i] = r.value; });
  }
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

async function generateAdCode(ad, componentName, scenes, totalFrames, maxAttempts = 3, { userId = null, adId = null } = {}) {
  return withRetries("ad-code", maxAttempts, async ({ attempt, feedback }) => {
    logVerbose(`  [ad-code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`);

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
    if (usage) {
      recordAiUsage({
        kind: "ad-code",
        provider: AD_CODE_PROVIDER.providerName,
        model: AD_CODE_PROVIDER.model,
        userId,
        adId,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        cachedTokens: usage.prompt_cache_hit_tokens || 0,
        // undefined (not present) whenever AD_CODE_MODEL=claude routes this
        // through streamAnthropicNative instead — recordAiUsage falls back
        // to the static (but Anthropic-published, still not a guess) rate.
        costUsd: usage.cost ?? null,
      });
    }

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

      logVerbose(`  [ad-code] Valid ad code generated (${validatedCode.length} chars) for ${componentName}`);
      return validatedCode;
    } catch (err) {
      err.isContentError = true;
      throw err;
    }
  }, { keyEnv: AD_CODE_PROVIDER.keyEnv });
}

module.exports = {
  generateCoursePlan,
  generateCourseQuiz,
  generateLessonCode,
  // Runs once per course, before any lesson starts building — see its own
  // comment for why this can't be folded into per-lesson header generation.
  generateCourseComponents,
  // Exposed so buildLesson (courseController.js) can kick off header
  // generation concurrently with scene audio synthesis instead of after it —
  // see the headerPromise param on generateLessonCode above.
  generateLessonHeader,
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
  // GLM concurrency limiter (serialized to 1) — remedial/next-course
  // generation (still GLM, via OpenRouter) uses this. Lesson code generation
  // uses its own separate limitLessonCodeCall, internal to this file only.
  limitZaiCall,
  // Shared concurrency pool for every OpenRouter-routed DeepSeek call —
  // sceneService.js's generateScenePlan AND levelAssessmentService.js's
  // pre-course level check both import this same limiter so their traffic is
  // coordinated against one pool, exactly like limitZaiCall above.
  limitDeepSeekCall,
  // levelAssessmentService.js's own DeepSeek calls route through this same
  // OpenRouter client rather than instantiating a second one.
  openRouterClient,
  describeError,
  isNonRetryable,
  backoffDelay,
  // Post-hoc single-scene patching (courseController.js's retry-scene route)
  // — fixes a real crash a user already hit, without regenerating the whole
  // lesson. See the comment above patchSceneFromRuntimeError.
  patchSceneFromRuntimeError,
  patchHeaderFromRuntimeError,
  locateErrorIsInHeader,
  extractUndefinedIdentifier,
  locateIdentifierScope,
  extractErrorLine,
  locateSceneIndexAtLineInFullCode,
};