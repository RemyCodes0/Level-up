const mongoose = require("mongoose");

// Lessons from free-mode courses the user has since deleted. Daily usage is
// counted from the Course collection, and deleting a course hard-deletes it, so
// without this a user could generate, delete, and generate again forever. Only
// needed for the limit's 24h window, so rows expire on their own.
const freeModeUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  lessonCount: { type: Number, required: true },
  courseCreatedAt: { type: Date, required: true, expires: 24 * 60 * 60 },
});

module.exports = mongoose.model("FreeModeUsage", freeModeUsageSchema);
