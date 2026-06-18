const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userName: { type: String, default: "Anonymous" },
    userEmail: { type: String, default: null },
    courseId: { type: String, default: null },
    courseName: { type: String, default: null },
    rating: { type: Number, min: 1, max: 5, required: true },
    message: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);