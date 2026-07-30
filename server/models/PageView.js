const mongoose = require("mongoose");

// One document per page load — first-party visit tracking so traffic data
// lives in this app's own database and can be aggregated in the admin
// dashboard, rather than depending on a call to PostHog/GA's own API for
// every dashboard load. Deliberately minimal: no raw IP stored (privacy-
// conscious default, matching the app's existing CookieConsent posture) —
// path, referrer, an anonymous per-browser sessionId, userAgent, and userId
// when the visitor happens to be logged in.
const pageViewSchema = new mongoose.Schema(
  {
    path: { type: String, required: true, index: true },
    referrer: { type: String, default: "" },
    sessionId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

pageViewSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PageView", pageViewSchema);
