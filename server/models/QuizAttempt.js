const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: Number, required: true },
    selected: { type: Number, required: true },
    correct: { type: Boolean, required: true },
    topic: { type: String, required: true },
  },
  { _id: false }
);

const topicBreakdownSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    correct: { type: Number, required: true },
    total: { type: Number, required: true },
    pct: { type: Number, required: true },
  },
  { _id: false }
);

// One doc per quiz submission — NOT upserted/overwritten, so a user can
// retake a course's quiz and build a score history over time (this is what
// powers the "trend vs. previous attempt" in the enhanced results view, and
// the "continuous learning" story more broadly).
const quizAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    // Set only when this attempt was submitted from inside a collaborative
    // room — null for a normal solo-course quiz. Lets the same submit
    // endpoint serve both without a separate collab-only code path.
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "CollabRoom", default: null },
    answers: [answerSchema],
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    pct: { type: Number, required: true },
    topicBreakdown: [topicBreakdownSchema],
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Most queries are "this user's attempts for this course, newest first" or
// "every attempt for this course in this room" (group aggregation).
quizAttemptSchema.index({ courseId: 1, userId: 1, submittedAt: -1 });
quizAttemptSchema.index({ roomId: 1, userId: 1, submittedAt: -1 });

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
