const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema({
  lessonNumber: Number,
  title: String,
  description: String,
  keyPoints: [String],
  narrationScript: String,
  audioUrl: String,
  videoUrl: String,
  // Browser-compiled player fields (new architecture)
  code: String,        // AI-generated Remotion TSX code string
  totalFrames: Number, // total duration in frames (sum of all scene durations)
  status: {
    type: String,
    enum: ["rendering", "ready", "failed", "locked"],
    default: "rendering",
  },
  // Set when status is "failed" — the actual error message from the last
  // failed attempt, so the frontend can tell the user why, not just that
  // it failed. Cleared back to null on a successful retry.
  error: {
    type: String,
    default: null,
  },
});

const questionSchema = new mongoose.Schema({
  id: Number,
  question: String,
  options: [String],
  correct: Number,
  topic: String,
});

const courseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    topic: String,
    // True if this course was generated using the user's free trial.
    // While true, only lesson 1 gets built — lessons 2-6 stay "locked"
    // until the user buys credits and unlocks the rest of THIS course
    // (see unlockRemainingLessonsHandler). Flips to false once unlocked.
    isFreeTrialCourse: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["generating", "ready", "failed"],
      default: "generating",
    },
    lessons: [lessonSchema],
    questions: [questionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);