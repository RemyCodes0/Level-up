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
    // Kept for analytics and for the frontend's "was this the free trial"
    // feedback-prompt logic — no longer gates lesson generation itself
    // (the free trial now builds the full course, all 6 lessons + quiz).
    isFreeTrialCourse: {
      type: Boolean,
      default: false,
    },
    // Shareable link support — a random, unguessable token (not the Mongo
    // _id) so shared URLs never expose or let anyone enumerate real course
    // IDs. Generated once on first share, then reused if unshared/re-shared.
    shareToken: {
      type: String,
      default: null,
      index: true,
    },
    // Whether the share link is CURRENTLY active. Kept separate from
    // shareToken so the owner can revoke access without losing the token —
    // re-sharing later reuses the same link instead of invalidating it.
    isShared: {
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