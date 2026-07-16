const mongoose = require("mongoose");

// One scene of the ad: a beat of the script with its measured voiceover.
const adSceneSchema = new mongoose.Schema({
  role: String,        // hook | problem | solution | feature | proof | cta
  script: String,      // the voiceover line for this beat
  onScreenText: String,
  visualDescription: String,
  audioUrl: String,
  durationInFrames: Number,
}, { _id: false });

const adSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // ── Input the user gave ──────────────────────────────────────────────────
    productName: { type: String, required: true },
    description: { type: String, required: true },
    websiteUrl: String,
    brandColor: { type: String, default: "#6366f1" },
    cta: { type: String, default: "Get started today" },
    logoUrl: String,           // hosted URL of uploaded logo (optional)
    screenshots: [String],     // hosted URLs of uploaded screenshots (optional)
    durationTarget: { type: Number, default: 30 }, // 30 or 60 seconds

    // ── Generated output ─────────────────────────────────────────────────────
    scenes: [adSceneSchema],
    code: String,              // the full Remotion TSX composition for the ad
    totalFrames: Number,

    status: {
      type: String,
      enum: ["queued", "planning", "generating", "ready", "failed"],
      default: "queued",
    },
    error: String,             // last error message when status === "failed"

    // Public sharing (reuses the same idea as courses)
    shareToken: { type: String, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ad", adSchema);