const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema({
  lessonNumber: Number,
  title: String,
  description: String,
  keyPoints: [String],
  narrationScript: String,
  audioUrl: String,
  videoUrl: String,
  status: {
    type: String,
    enum: ["rendering", "ready", "failed"],
    default: "rendering",
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
    // Owner of the course — used to scope courses per logged-in user
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    topic: String,
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