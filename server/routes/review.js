const express = require("express");
const router = express.Router();
const { getReviewsByTutor, addReview, getReviewsByUser } = require("../controllers/reviewController");
const { protect } = require("../middleware/authMiddleware");



router.get("/review", protect, getReviewsByUser);




router.get("/:tutorId", getReviewsByTutor);

router.post("/:tutorId", protect, addReview);

module.exports = router;
