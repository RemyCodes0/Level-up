const { Router } = require("express");
const multer = require("multer");
const {
  generateCourseHandler,
  getCourseStatusHandler,
} = require("../controllers/courseController");

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/generate", upload.single("file"), generateCourseHandler);
router.get("/status/:courseId", getCourseStatusHandler);

module.exports = router;