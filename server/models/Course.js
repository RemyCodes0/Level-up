const mongoose = require("mongoose");

// Lightweight scene boundary metadata — NOT the full scene plan (narration
// text, visual description, audio file path are all still discarded after
// code generation, same as before). Just enough to bucket a playback
// position (frame number) into "which scene was that" for replay analytics
// (see server/models/Progress.js) without needing to parse the compiled TSX.
const sceneMetaSchema = new mongoose.Schema(
  {
    index: Number,       // 0-based, matches array/playback order
    startFrame: Number,
    endFrame: Number,
    label: String,       // onScreenText — short human-readable identifier
  },
  { _id: false }
);

// One entry per expected scene, populated incrementally WHILE a lesson is
// still generating — powers a passive progress filmstrip (real thumbnails
// appearing in order, no playback) shown before the lesson is ready. Created
// right after the scene plan resolves (index/label known immediately;
// durationInFrames/audioReady/codeReady/previewCode fill in as audio then
// code generation actually complete for that scene). Distinct from
// sceneMetaSchema above, which is for the FINAL ready lesson's replay
// analytics — this is purely a mid-generation, disposable progress signal.
const sceneProgressSchema = new mongoose.Schema(
  {
    index: Number,
    durationInFrames: { type: Number, default: null },
    label: String,
    audioReady: { type: Boolean, default: false },
    codeReady: { type: Boolean, default: false },
    // A self-contained, directly compilable single-scene composition (header
    // + just this scene, stitched) — see stitchLessonCode in claudeService.js.
    previewCode: { type: String, default: null },
  },
  { _id: false }
);

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
  scenes: [sceneMetaSchema],
  sceneProgress: [sceneProgressSchema],
  // True when this lesson was AI-generated from group quiz weaknesses
  // rather than part of the original course plan (see remedialService.js).
  isRemedial: { type: Boolean, default: false },
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
    // Public gallery listing — distinct from isShared. isShared/shareToken
    // is a private, unguessable-link mechanism (no browsing/search); a
    // published course is additionally listed in the searchable public
    // gallery by its real _id. Publishing a course also turns on isShared
    // (see publishCourseHandler) so the gallery has a working link to send
    // people to, but unpublishing only delists it — it doesn't revoke a
    // link the owner may have shared independently.
    isPublished: {
      type: Boolean,
      default: false,
    },
    // Set (and re-set) every time a course is published — drives the
    // gallery's default sort (most-recently-published first) and is half of
    // the keyset-pagination cursor (see listPublicCoursesHandler).
    publishedAt: {
      type: Date,
      default: null,
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

courseSchema.index({ status: 1 });

// Gallery browse (no search term): keyset-paginate published courses by
// recency. _id: -1 as a tiebreaker for courses with the same publishedAt
// (same millisecond) keeps pagination stable — without it, two courses
// published in the same instant could each be skipped or duplicated across
// a page boundary. Sort order matches the index order exactly so Mongo can
// walk it directly instead of an in-memory sort, however deep the pagination
// goes — the property that makes this scale to millions of rows where
// skip/limit would degrade linearly with page depth.
courseSchema.index({ isPublished: 1, publishedAt: -1, _id: -1 });

// Gallery search: a text index scoped to published courses only (compound
// with isPublished as a leading equality field) so `Course.find({
// isPublished: true, $text: { $search: q } })` can use the index for both
// the filter and the search, instead of a full collection scan.
courseSchema.index({ isPublished: 1, topic: "text" });

module.exports = mongoose.model("Course", courseSchema);