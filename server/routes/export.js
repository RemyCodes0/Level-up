const { Router } = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  startExport,
  getExportStatus,
  downloadExport,
} = require("../controllers/exportController");

const router = Router();

router.post("/:courseId/:lessonNumber", protect, startExport);
router.get("/:jobId/status", protect, getExportStatus);
router.get("/:jobId/download", protect, downloadExport);

module.exports = router;