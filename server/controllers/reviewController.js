const Booking = require("../models/Booking");
const Review = require("../models/Review");
const User = require("../models/User");

exports.getReviewsByTutor = async (req, res) => {
  try {
    const tutorId = req.params.tutorId;
    const reviews = await Review.find({ tutor: tutorId })
      .populate("student", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getReviewsByUser = async (req, res) => {
  try {
    const reviews = await Review.find({ tutor: req.user._id })
      .populate("student", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(reviews);
  } catch (err) {
    console.error("Error in getReviewsByUser:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.addReview = async (req, res) => {
  try {
    const { tutorId } = req.params;
    const { rating, comment } = req.body;

    const existing = await Review.findOne({
      tutor: tutorId,
      student: req.user._id,
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "You have already reviewed this tutor" });
    }

    const booking = await Booking.findOne({
      tutor: tutorId,
      student: req.user._id,
      status: { $in: ["pending", "confirmed", "completed"] }
    });

    if (!booking) {
      return res.status(403).json({ message: "You must book this tutor before reviewing." });
    }

    const review = new Review({
      tutor: tutorId,
      student: req.user._id,
      rating,
      comment,
    });

    await review.save();
    const populated = await review.populate("student", "name email");

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/reviews/admin?page=1&limit=20 — admin-only, no equivalent existed
// before this (list-all-reviews, across every tutor).
exports.adminGetAllReviews = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [reviews, total] = await Promise.all([
      Review.find({})
        .populate("tutor", "name email")
        .populate("student", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments({}),
    ]);

    res.json({ reviews, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("adminGetAllReviews error:", err);
    res.status(500).json({ message: "Failed to load reviews" });
  }
};

// DELETE /api/reviews/admin/:id — admin-only moderation.
exports.adminDeleteReview = async (req, res) => {
  try {
    const deleted = await Review.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Review not found" });
    res.status(200).json({ message: "Review deleted" });
  } catch (err) {
    console.error("adminDeleteReview error:", err);
    res.status(500).json({ message: "Failed to delete review" });
  }
};