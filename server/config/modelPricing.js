// $/M-token pricing for every model this app actually calls, sourced from
// each provider's own published pricing page (checked 2026-07-30). Prices
// change over time — this is a point-in-time snapshot, not a live feed, so
// re-verify against the provider's page if a course's costUsd starts
// looking implausible.
//
// Every model here is billed the standard "$/M input tokens, $/M output
// tokens" way EXCEPT Kokoro (TTS), which OpenRouter bills per INPUT TEXT
// TOKEN only (no charge for the audio it returns) — see the comment on
// KOKORO_CHARS_PER_TOKEN below for why that number itself is an estimate.
const MODEL_PRICING = {
  // GLM 5.2 via OpenRouter (z-ai/glm-5.2) — lesson code, remedial plan,
  // next-course suggestions. https://openrouter.ai/z-ai/glm-5.2
  "z-ai/glm-5.2": { inputPerM: 0.70, outputPerM: 2.20 },

  // DeepSeek V4 Flash via OpenRouter — course plan, scene plan, level
  // assessment. https://openrouter.ai/deepseek/deepseek-v4-flash
  "deepseek/deepseek-v4-flash": { inputPerM: 0.09, outputPerM: 0.18 },

  // Claude Sonnet 5, direct Anthropic API (the optional LESSON_CODE_MODEL=
  // claude override) — introductory rate through 2026-08-31. RISES to
  // $3/$15 per M after that date — bump this then.
  // https://platform.claude.com/docs/en/about-claude/pricing
  "claude-sonnet-5": { inputPerM: 2, outputPerM: 10 },

  // Claude Haiku 5.5 via OpenRouter (anthropic/claude-haiku-5.5 — note the
  // DOT, not a dash) — the PLAN_MODEL=haiku / QUIZ_MODEL=haiku default (see
  // claudeService.js's CLAUDE_HAIKU_PLAN_PROVIDER). Verified LIVE against
  // OpenRouter's own API on 2026-10-13:
  //   curl https://openrouter.ai/api/v1/models/anthropic/claude-haiku-5.5/endpoints
  // Base tier below 100K prompt tokens, which is what this app's plan/quiz
  // calls actually use — an Anthropic long-context step ($0.50/$2.50) kicks
  // in above that but isn't reachable at this app's prompt sizes. This entry
  // is a fallback/documentation one, not load-bearing: the course-plan and
  // quiz call sites both already request usage:{include:true} and log the
  // REAL OpenRouter-billed usage.cost, same as every other OpenRouter model
  // here that reports real cost.
  "anthropic/claude-haiku-5.5": { inputPerM: 0.10, outputPerM: 0.50 },

  // Kokoro-82M TTS via OpenRouter — billed per INPUT TEXT TOKEN, $0 for
  // output audio. https://openrouter.ai/hexgrad/kokoro-82m
  "hexgrad/kokoro-82m": { inputPerM: 0.62, outputPerM: 0 },

  // Gemini 3.8 Flash-Lite TTS via OpenRouter — the optional TTS_MODEL=gemini
  // alternative to Kokoro (see ttsService.js). Verified LIVE against
  // OpenRouter's own API on 2026-10-13:
  //   curl https://openrouter.ai/api/v1/models/google/gemini-3.8-flash-lite-tts/endpoints
  //   → pricing.prompt "0.0000005" ($0.50/M), pricing.completion "0.000006" ($6/M)
  // UNLIKE Kokoro, this one bills REAL money for output — Gemini's TTS
  // tokenizes the audio it generates and charges for it, it isn't free just
  // because Kokoro's was. See GEMINI_TTS_AUDIO_TOKENS_PER_SECOND below for
  // how ttsService.js turns clip duration into the completionTokens this
  // needs to actually count that cost instead of silently reporting $0 for
  // the expensive half of the call.
  "google/gemini-3.8-flash-lite-tts": { inputPerM: 0.50, outputPerM: 6.00 },

  // Fish Audio Drama 3 TTS via OpenRouter — the default voice as of
  // 2026-10-24 (TTS_MODEL=fish, see ttsService.js). Verified LIVE:
  //   curl https://openrouter.ai/api/v1/models/fish-audio/drama-3/endpoints
  //   → pricing.prompt "0.000002" ($2.00/M), pricing.completion "0" (free)
  // Same input-text-only billing shape as Kokoro (not Gemini's billed-audio-
  // output shape) — just ~3.2x Kokoro's $0.62/M, not a 50-60x jump.
  "fish-audio/drama-3": { inputPerM: 2.00, outputPerM: 0 },
};

// Gemini's TTS output is billed as audio tokens, not raw seconds — Google
// Cloud's own pricing docs state the conversion directly: 25 tokens per
// second of generated audio (https://cloud.google.com/text-to-speech/pricing,
// which documents the same Gemini TTS audio-token billing the Gemini API
// itself uses). OpenRouter's audio/speech endpoint returns raw audio bytes
// with no usage/token-count field at all — same situation as Kokoro — so
// this is the estimate path for Gemini's completionTokens, exactly as
// estimateTokensFromChars is the estimate path for everyone's promptTokens.
const GEMINI_TTS_AUDIO_TOKENS_PER_SECOND = 25;

function estimateGeminiAudioTokens(durationSeconds) {
  return Math.ceil((durationSeconds || 0) * GEMINI_TTS_AUDIO_TOKENS_PER_SECOND);
}

// The TTS API (openai.audio.speech.create) returns no usage/token-count
// field at all — there is no exact figure available. ~4 chars/token is the
// standard rough approximation for English text (same ballpark GPT/Claude
// tokenizers use); Kokoro's actual tokenizer may differ slightly, so any
// cost derived from this is explicitly an ESTIMATE, not a measured value —
// label it as such in any UI that displays it.
const KOKORO_CHARS_PER_TOKEN = 4;

function estimateTokensFromChars(characters) {
  return Math.ceil((characters || 0) / KOKORO_CHARS_PER_TOKEN);
}

// Computes cost in USD for one call. `promptTokens`/`completionTokens` are
// what every text-generation call site already gets back from its
// provider's `usage` object; for TTS, pass estimateTokensFromChars(chars)
// as `promptTokens` and leave `completionTokens` at 0 (Kokoro's output is
// unbilled).
function computeCostUsd(modelId, { promptTokens = 0, completionTokens = 0 } = {}) {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) {
    console.warn(`[modelPricing] No pricing entry for model "${modelId}" — logging cost as $0. Add it to MODEL_PRICING.`);
    return 0;
  }
  return (promptTokens / 1e6) * pricing.inputPerM + (completionTokens / 1e6) * pricing.outputPerM;
}

module.exports = {
  MODEL_PRICING,
  computeCostUsd,
  estimateTokensFromChars,
  KOKORO_CHARS_PER_TOKEN,
  estimateGeminiAudioTokens,
  GEMINI_TTS_AUDIO_TOKENS_PER_SECOND,
};
