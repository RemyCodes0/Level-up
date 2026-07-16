const { Router } = require("express");
const multer = require("multer");
const { protect } = require("../middleware/authMiddleware");
const { checkCredits } = require("../middleware/checkCredits");
const {
  createRoom,
  joinRoomById,
  joinRoomByCode,
  previewRoomByLink,
  joinRoomByLink,
  getRoom,
  listMyRooms,
  getDashboard,
} = require("../controllers/collabController");

const router = Router();

// Same upload config as /api/course/generate (routes/course.js) — a
// collaborative room's shared course can be seeded from a topic, PDF, or
// PPTX exactly like a solo course can.
const ACCEPTED_COURSE_FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ACCEPTED_COURSE_FILE_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only PDF and PPTX files are supported."));
  },
});
function handleCourseFileUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Invalid file upload" });
    next();
  });
}

// Public — preview an invite link before joining (no account action yet).
router.get("/join/link/:shareToken", previewRoomByLink);

router.post("/join/link/:shareToken", protect, joinRoomByLink);
router.post("/join/:inviteCode", protect, joinRoomByCode);

router.post("/rooms", protect, checkCredits, handleCourseFileUpload, createRoom);
router.get("/rooms/mine", protect, listMyRooms);
router.get("/rooms/:roomId", protect, getRoom);
router.post("/rooms/:roomId/join", protect, joinRoomById);
router.get("/rooms/:roomId/dashboard", protect, getDashboard);

module.exports = router;
