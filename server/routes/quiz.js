const { Router } = require("express");
const { protect } = require("../middleware/authMiddleware");
const { submitQuiz, getAttempts, getLatestAttempt } = require("../controllers/quizController");

const router = Router();

router.post("/:courseId/submit", protect, submitQuiz);
router.get("/:courseId/attempts", protect, getAttempts);
router.get("/:courseId/attempts/latest", protect, getLatestAttempt);

module.exports = router;
