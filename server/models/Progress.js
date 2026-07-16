const mongoose = require("mongoose");

// One replay counter per scene within a lesson. sceneIndex matches the
// index into the lesson's persisted `scenes[]` (see Course.js lessonSchema),
// which in turn matches playback order in the compiled <Series>.
const sceneReplaySchema = new mongoose.Schema(
  {
    sceneIndex: { type: Number, required: true },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const lessonProgressSchema = new mongoose.Schema(
  {
    lessonNumber: { type: Number, required: true },
    watched: { type: Boolean, default: false },
    watchedAt: { type: Date, default: null },
    // Times the lesson was replayed from the start (video ended, watched
    // again) — distinct from scene-level seek-backward replays below.
    replayCount: { type: Number, default: 0 },
    sceneReplays: [sceneReplaySchema],
  },
  { _id: false }
);

// One doc per (userId, courseId) — this is what makes "watched" and quiz
// completion survive a page refresh, which nothing in the app did before
// (see AiTutor.tsx's markComplete, previously pure client state).
const progressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    lessons: [lessonProgressSchema],
    // Set once every lesson on the course is watched. Re-checked (and left
    // set, never unset) each time a lesson is marked watched — a remedial
    // lesson appended later just means completedAt gets recomputed against
    // the new, longer lesson list next time progress is updated.
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

progressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model("Progress", progressSchema);
