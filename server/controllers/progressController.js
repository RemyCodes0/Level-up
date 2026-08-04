const Progress = require("../models/Progress");
const Course = require("../models/Course");

async function getOrCreateProgress(userId, courseId) {
  let progress = await Progress.findOne({ userId, courseId });
  if (!progress) progress = await Progress.create({ userId, courseId, lessons: [] });
  return progress;
}

// GET /api/progress/:courseId — restores watched-state on page load. Before
// this endpoint existed, "watched" lived only in AiTutor.tsx's React state
// (markComplete) and reset to false on every refresh.
exports.getProgress = async (req, res) => {
  try {
    const progress = await Progress.findOne({
      userId: req.user._id,
      courseId: req.params.courseId,
    }).lean();

    res.json(
      progress || {
        userId: req.user._id,
        courseId: req.params.courseId,
        lessons: [],
        completedAt: null,
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load progress" });
  }
};

// POST /api/progress/:courseId/lesson/:lessonNumber/watched — called when a
// lesson's video ends. First time = watched; subsequent calls for an
// already-watched lesson = a full replay-from-start (distinct from the
// scene-level seeks tracked by logReplay below).
exports.markWatched = async (req, res) => {
  try {
    const { courseId, lessonNumber } = req.params;
    const lessonNum = Number(lessonNumber);
    if (!Number.isInteger(lessonNum)) return res.status(400).json({ error: "Invalid lesson number" });

    const course = await Course.findById(courseId).select("lessons.lessonNumber").lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    const progress = await getOrCreateProgress(req.user._id, courseId);
    const existing = progress.lessons.find((l) => l.lessonNumber === lessonNum);

    if (existing) {
      if (existing.watched) existing.replayCount = (existing.replayCount || 0) + 1;
      else {
        existing.watched = true;
        existing.watchedAt = new Date();
      }
    } else {
      progress.lessons.push({ lessonNumber: lessonNum, watched: true, watchedAt: new Date(), replayCount: 0, sceneReplays: [] });
    }

    // Re-derived from the CURRENT course.lessons every time (not cached) —
    // so if a remedial lesson gets appended later, completion correctly
    // requires watching that one too, not just the original set.
    const allWatched =
      course.lessons.length > 0 &&
      course.lessons.every((l) => progress.lessons.some((p) => p.lessonNumber === l.lessonNumber && p.watched));
    if (allWatched && !progress.completedAt) progress.completedAt = new Date();

    await progress.save();
    res.json(progress);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update progress" });
  }
};

// POST /api/progress/:courseId/lesson/:lessonNumber/replay — a seek-backward
// past a scene boundary. Body: { sceneIndex } (matches Course lesson's
// scenes[].index). Falls back to lesson-level replayCount if sceneIndex is
// omitted (e.g. a player that hasn't wired up scene-boundary detection yet).
exports.logReplay = async (req, res) => {
  try {
    const { courseId, lessonNumber } = req.params;
    const { sceneIndex } = req.body;
    const lessonNum = Number(lessonNumber);
    if (!Number.isInteger(lessonNum)) return res.status(400).json({ error: "Invalid lesson number" });

    const progress = await getOrCreateProgress(req.user._id, courseId);
    let lesson = progress.lessons.find((l) => l.lessonNumber === lessonNum);
    if (!lesson) {
      progress.lessons.push({ lessonNumber: lessonNum, watched: false, watchedAt: null, replayCount: 0, sceneReplays: [] });
      lesson = progress.lessons[progress.lessons.length - 1];
    }

    if (typeof sceneIndex === "number") {
      const sr = lesson.sceneReplays.find((s) => s.sceneIndex === sceneIndex);
      if (sr) sr.count += 1;
      else lesson.sceneReplays.push({ sceneIndex, count: 1 });
    } else {
      lesson.replayCount = (lesson.replayCount || 0) + 1;
    }

    await progress.save();
    res.json(progress);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to log replay" });
  }
};

// POST /api/progress/:courseId/lesson/:lessonNumber/position — periodic ping
// from the player (see AiTutor.tsx's throttled handleFrameUpdate) reporting
// the current frame. Fires far more often than markWatched/logReplay, so it
// returns a minimal ack instead of the full Progress doc — the client has no
// need to resync state from it.
exports.logPosition = async (req, res) => {
  try {
    const { courseId, lessonNumber } = req.params;
    const lessonNum = Number(lessonNumber);
    if (!Number.isInteger(lessonNum)) return res.status(400).json({ error: "Invalid lesson number" });

    const frame = Math.floor(req.body.frame);
    if (!Number.isFinite(frame) || frame < 0) return res.status(400).json({ error: "Invalid frame" });

    const progress = await getOrCreateProgress(req.user._id, courseId);
    let lesson = progress.lessons.find((l) => l.lessonNumber === lessonNum);
    if (!lesson) {
      progress.lessons.push({ lessonNumber: lessonNum, watched: false, watchedAt: null, replayCount: 0, sceneReplays: [] });
      lesson = progress.lessons[progress.lessons.length - 1];
    }

    lesson.lastPositionFrame = frame;
    lesson.lastPlayedAt = new Date();

    await progress.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to log position" });
  }
};

// Internal helper (used by dashboard/remedial aggregation, not exposed as a
// route) — every course this user has any progress on.
exports.getOrCreateProgress = getOrCreateProgress;
