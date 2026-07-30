const mongoose = require("mongoose");

// One document per AI generation call (course plan, scene plan, lesson code,
// remedial plan, next-course suggestions, level assessment, ad code, TTS).
// This is the real, queryable $ cost ledger this app never had before —
// GenerationLog tracks success/failure, this tracks what each call actually
// cost. costUsd is computed and stored at WRITE time (via
// config/modelPricing.js), not recomputed later — so historical rows stay
// accurate even after a model's price changes going forward.
const aiUsageLogSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: [
        "course-plan",
        "scene-plan",
        // "lesson-code" is the old single-call kind — kept in the enum so
        // historical rows written under that pipeline still validate/query
        // correctly. The split header+per-scene pipeline (current) writes
        // "lesson-header"/"lesson-scene" instead, giving per-phase cost
        // visibility that a single "lesson-code" bucket couldn't.
        "lesson-code",
        "lesson-header",
        "lesson-scene",
        "remedial-plan",
        "next-course",
        "level-assessment",
        "ad-plan",
        "ad-code",
        "tts",
      ],
      required: true,
      index: true,
    },
    provider: { type: String, required: true }, // "glm" | "deepseek" | "fable" | "claude" | "kokoro-tts"
    model: { type: String, required: true }, // exact model id, e.g. "z-ai/glm-5.2"
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // Exactly one of courseId/adId is set for course-path/ad-path calls;
    // both null for level-assessment, which runs BEFORE a course exists.
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null, index: true },
    adId: { type: mongoose.Schema.Types.ObjectId, ref: "Ad", default: null },
    // Text-generation calls (everything except "tts"):
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    cachedTokens: { type: Number, default: 0 },
    // TTS calls only: the TTS API returns no token-count usage field at
    // all, so `estimatedTokens` is derived from `characters` (see
    // config/modelPricing.js) — always treat TTS cost as an estimate, not
    // an exact figure, in any UI that renders it.
    characters: { type: Number, default: 0 },
    estimatedTokens: { type: Number, default: 0 },
    costUsd: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiUsageLog", aiUsageLogSchema);
