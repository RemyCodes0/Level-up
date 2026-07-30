// services/aiUsageService.js
//
// One shared write path for the AI cost ledger (AiUsageLog) — every
// generation call site (claudeService, sceneService, levelAssessmentService,
// ttsService) calls recordAiUsage() right after its existing console-only
// logUsage() call, instead of each duplicating its own Mongoose-write
// boilerplate and cost-math.
//
// Never throws and never blocks generation: a logging failure here must
// never take down a real course/ad build, same non-fatal philosophy already
// used for GenerationLog writes and progress-notification callbacks
// elsewhere in this codebase.
const AiUsageLog = require("../models/AiUsageLog");
const { computeCostUsd } = require("../config/modelPricing");

async function recordAiUsage({
  kind,
  provider,
  model,
  userId = null,
  courseId = null,
  adId = null,
  promptTokens = 0,
  completionTokens = 0,
  cachedTokens = 0,
  characters = 0,
  estimatedTokens = 0,
}) {
  try {
    const costUsd = computeCostUsd(model, {
      promptTokens: promptTokens || estimatedTokens,
      completionTokens,
    });
    await AiUsageLog.create({
      kind,
      provider,
      model,
      userId,
      courseId,
      adId,
      promptTokens,
      completionTokens,
      cachedTokens,
      characters,
      estimatedTokens,
      costUsd,
    });
  } catch (err) {
    console.warn(`[aiUsage] Failed to record usage for "${kind}" (non-fatal): ${err.message}`);
  }
}

module.exports = { recordAiUsage };
