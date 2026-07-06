const { Router } = require("express");
const multer = require("multer");
const {
  generateCourseHandler,
  getCourseStatusHandler,
  listCoursesHandler,
  getShowcaseCoursesHandler,
  retryLessonHandler,
  deleteCourseHandler,
  unlockRemainingLessonsHandler,
  generateShareLinkHandler,
  unshareCourseHandler,
} = require("../controllers/courseController");

// TODO: import YOUR existing auth middleware here.
// It's the same one you use to protect your tutoring/login-only routes.
// Common names: authMiddleware, protect, requireAuth, verifyToken.
// Example (adjust path + name to match your project):
// const { protect } = require("../middleware/auth");
const { protect } = require("../middleware/authMiddleware");
const { checkCredits } = require("../middleware/checkCredits");

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public — no auth required, used by the marketing showcase page
router.get("/showcase", getShowcaseCoursesHandler);

// All other course routes require a logged-in user (so req.user exists)
router.post("/generate", protect, checkCredits, upload.single("file"), generateCourseHandler);
router.post("/:courseId/share", protect, generateShareLinkHandler);
router.delete("/:courseId/share", protect, unshareCourseHandler);
 
router.post("/:courseId/retry/:lessonIndex", protect, retryLessonHandler);
router.post("/:courseId/unlock", protect, unlockRemainingLessonsHandler);
router.get("/status/:courseId", protect, getCourseStatusHandler);
router.get("/list", protect, listCoursesHandler);
router.delete("/:courseId", protect, deleteCourseHandler);

module.exports = router;