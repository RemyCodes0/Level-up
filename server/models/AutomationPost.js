const mongoose = require("mongoose");

// One doc per automation cycle — the history/audit trail the admin
// Automation page reads. Created at the START of a cycle (status
// "generating") and updated in place as the cycle progresses, so a run
// that's still in flight (or that crashed mid-way) is visible, not silent.
const postUrlSchema = new mongoose.Schema(
  { platform: String, url: String },
  { _id: false }
);

const automationPostSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    caption: { type: String, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    status: {
      type: String,
      enum: ["generating", "rendering", "posting", "posted", "failed"],
      default: "generating",
    },
    platforms: { type: [String], default: [] },
    bufferPostId: { type: String, default: null },
    postUrls: { type: [postUrlSchema], default: [] },
    // The MP4 is deleted from disk right after a successful post (see
    // automationService.js) — this row is the only surviving record that a
    // video existed at all, hence the separate timestamp rather than just
    // inferring "gone" from status.
    videoDeletedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

automationPostSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AutomationPost", automationPostSchema);
