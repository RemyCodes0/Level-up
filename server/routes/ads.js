const { Router } = require("express");
const multer = require("multer");
const { protect } = require("../middleware/authMiddleware");
const {
  generateAdHandler,
  getAdStatusHandler,
  listAdsHandler,
  getAdHandler,
  retryAdHandler,
  deleteAdHandler,
} = require("../controllers/adController");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
});

// logo (1) + screenshots (up to 5)
const adUpload = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "screenshots", maxCount: 5 },
]);

router.post("/generate", protect, adUpload, generateAdHandler);
router.get("/status/:adId", protect, getAdStatusHandler);
router.get("/list", protect, listAdsHandler);
router.get("/:adId", protect, getAdHandler);
router.post("/:adId/retry", protect, retryAdHandler);
router.delete("/:adId", protect, deleteAdHandler);

module.exports = router;