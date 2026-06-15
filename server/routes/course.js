const { Router } = require("express");
const multer = require("multer");
const {
  generateCourseHandler,
  getCourseStatusHandler,
  listCoursesHandler,
  deleteCourseHandler,
} = require("../controllers/courseController");
const { protect } = require("../middleware/authMiddleware");

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All course routes require a logged-in user (so req.user exists)
router.post("/generate", protect, upload.single("file"), generateCourseHandler);
router.get("/status/:courseId", protect, getCourseStatusHandler);
router.get("/list", protect, listCoursesHandler);
router.delete("/:courseId", protect, deleteCourseHandler);

module.exports = router;