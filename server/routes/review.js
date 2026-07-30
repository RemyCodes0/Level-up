const express = require("express");
const router = express.Router();
const { getReviewsByTutor, addReview, getReviewsByUser, adminGetAllReviews, adminDeleteReview } = require("../controllers/reviewController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/requireAdmin");



router.get("/review", protect, getReviewsByUser);

// Registered BEFORE the "/:tutorId" wildcard below — otherwise Express would
// match "/admin" as tutorId="admin" and this would never be reached.
router.get("/admin", protect, requireAdmin, adminGetAllReviews);
router.delete("/admin/:id", protect, requireAdmin, adminDeleteReview);

router.get("/:tutorId", getReviewsByTutor);

router.post("/:tutorId", protect, addReview);

module.exports = router;
