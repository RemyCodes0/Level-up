const express = require("express");
const router = express.Router();
const { getReviewsByTutor, addReview } = require("../controllers/reviewController");
const { protect } = require("../middleware/authMiddleware");

router.get("/:tutorId", getReviewsByTutor);
router.post("/:tutorId", protect, addReview);

module.exports = router;
