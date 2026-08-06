const { Router } = require("express");
const multer = require("multer");
const {
  generateCourseHandler,
  getCourseStatusHandler,
  listCoursesHandler,
  getShowcaseCoursesHandler,
  retryLessonHandler,
  retrySceneHandler,
  deleteCourseHandler,
  unlockRemainingLessonsHandler,
  generateShareLinkHandler,
  unshareCourseHandler,
  getSharedCourseHandler,
  publishCourseHandler,
  unpublishCourseHandler,
  listPublicCoursesHandler,
  getNextSuggestionsHandler,
} = require("../controllers/courseController");

// TODO: import YOUR existing auth middleware here.
// It's the same one you use to protect your tutoring/login-only routes.
// Common names: authMiddleware, protect, requireAuth, verifyToken.
// Example (adjust path + name to match your project):
// const { protect } = require("../middleware/auth");
const { protect } = require("../middleware/authMiddleware");
const { checkCredits } = require("../middleware/checkCredits");

const ACCEPTED_COURSE_FILE_TYPES = new Set([
  "application/pdf",
  // .pptx — legacy .ppt (application/vnd.ms-powerpoint) isn't supported;
  // it's a different binary format the extraction pipeline doesn't parse.
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — decks with embedded images run bigger than text-only PDFs
  fileFilter: (req, file, cb) => {
    if (ACCEPTED_COURSE_FILE_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PDF and PPTX files are supported."));
  },
});

// Public — no auth required, used by the marketing showcase page
router.get("/showcase", getShowcaseCoursesHandler);

// Public — no auth required. Anyone with a shared link (no account needed)
// hits this to view a course someone else chose to share. Must stay
// WITHOUT `protect` — that's the whole point of a public share link.
router.get("/shared/:shareToken", getSharedCourseHandler);

// Public — no auth required. The searchable, paginated public course
// gallery — anyone can browse what other users have published.
router.get("/public", listPublicCoursesHandler);

// multer's fileFilter/limits errors call next(err) — with no global Express
// error handler in app.js, that error would otherwise fall through to
// Express's default HTML error page instead of a clean JSON response.
function handleCourseFileUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Invalid file upload" });
    next();
  });
}

// All other course routes require a logged-in user (so req.user exists).
// handleCourseFileUpload MUST run before checkCredits — it's the multer
// middleware that parses the multipart body, and checkCredits now needs
// req.body.tier (multipart fields aren't populated until multer runs).
router.post("/generate", protect, handleCourseFileUpload, checkCredits, generateCourseHandler);
router.post("/:courseId/share", protect, generateShareLinkHandler);
router.delete("/:courseId/share", protect, unshareCourseHandler);
router.post("/:courseId/publish", protect, publishCourseHandler);
router.delete("/:courseId/publish", protect, unpublishCourseHandler);

router.post("/:courseId/retry/:lessonIndex", protect, retryLessonHandler);
router.post("/:courseId/retry-scene/:lessonIndex", protect, retrySceneHandler);
router.post("/:courseId/unlock", protect, unlockRemainingLessonsHandler);
router.get("/status/:courseId", protect, getCourseStatusHandler);
router.get("/list", protect, listCoursesHandler);
router.get("/:courseId/next-suggestions", protect, getNextSuggestionsHandler);
router.delete("/:courseId", protect, deleteCourseHandler);

module.exports = router;