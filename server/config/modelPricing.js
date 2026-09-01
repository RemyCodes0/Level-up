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

  // Kokoro-82M TTS via OpenRouter — billed per INPUT TEXT TOKEN, $0 for
  // output audio. https://openrouter.ai/hexgrad/kokoro-82m
  "hexgrad/kokoro-82m": { inputPerM: 0.62, outputPerM: 0 },
};

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

module.exports = { MODEL_PRICING, computeCostUsd, estimateTokensFromChars, KOKORO_CHARS_PER_TOKEN };
