const { Router } = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getProgress, markWatched, logReplay, logPosition } = require("../controllers/progressController");

const router = Router();

// All progress routes are per-authenticated-user — a user's own watch
// state, never someone else's.
router.get("/:courseId", protect, getProgress);
router.post("/:courseId/lesson/:lessonNumber/watched", protect, markWatched);
router.post("/:courseId/lesson/:lessonNumber/replay", protect, logReplay);
router.post("/:courseId/lesson/:lessonNumber/position", protect, logPosition);

module.exports = router;
