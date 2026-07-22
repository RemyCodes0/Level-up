const mongoose = require("mongoose");

// One document per lesson generation ATTEMPT (not per lesson) — if a lesson
// is retried, each attempt gets its own log entry, so you can see the full
// history of what happened, not just the final outcome.
const generationLogSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    lessonNumber: { type: Number, required: true },
    lessonTitle: { type: String, default: null },
    status: {
      type: String,
      enum: ["success", "failed"],
      required: true,
    },
    // Which stage failed — useful for spotting patterns (e.g. "code"
    // failing repeatedly vs "scenes" or "audio").
    stage: {
      type: String,
      enum: ["scenes", "audio", "header", "code"],
      default: null,
    },
    errorMessage: { type: String, default: null },
    durationSec: { type: Number, required: true },
    attemptNumber: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GenerationLog", generationLogSchema);