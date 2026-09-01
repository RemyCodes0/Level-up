const mongoose = require("mongoose");

// One document per AI generation call (course plan, scene plan, lesson code,
// remedial plan, next-course suggestions, level assessment, TTS).
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
        // Quiz generation moved out of "course-plan" into its own call,
        // made AFTER every lesson builds so it can ground questions in each
        // lesson's real narration — see generateCourseQuiz (claudeService.js).
        "course-quiz",
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
        "tts",
      ],
      required: true,
      index: true,
    },
    provider: { type: String, required: true }, // "glm" | "deepseek" | "fable" | "claude" | "kokoro-tts"
    model: { type: String, required: true }, // exact model id, e.g. "z-ai/glm-5.2"
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // Null for level-assessment, which runs BEFORE a course exists.
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null, index: true },
    // Set only for calls scoped to ONE lesson (header, chunk, scene-plan,
    // TTS) — null for course-wide calls (course-plan, course-quiz, course
    // components). What lets courseController.js sum "the total cost of
    // THIS lesson" instead of only "this course" — see the summary logged
    // at the end of buildLesson.
    lessonNumber: { type: Number, default: null, index: true },
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
    // true = costUsd came straight from the provider's own response
    // (OpenRouter's usage.cost, requested via `usage: { include: true }` —
    // see streamOpenAiCompatible/generateJson in claudeService.js) — the
    // actual dollar amount billed, reflecting whichever provider handled
    // this specific call and any cache discount actually applied. false =
    // costUsd fell back to the static config/modelPricing.js table (only
    // happens for TTS, which the Kokoro API returns no usage/cost data for
    // at all, and the Anthropic-native direct path, which has no
    // OpenRouter-style per-call cost field but IS billed at Anthropic's own
    // fixed published rate — a small but real distinction from a genuine
    // guess).
    isRealCost: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiUsageLog", aiUsageLogSchema);
