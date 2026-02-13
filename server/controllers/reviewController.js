const Booking = require("../models/Booking");
const Review = require("../models/Review");
const User = require("../models/User");

exports.getReviewsByTutor = async (req, res) => {
  try {
    const tutorId = req.params.tutorId;
    const reviews = await Review.find({ tutor: tutorId })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getReviewsByUser = async (req, res) => {
  try {
    console.log("=== getReviewsByUser Debug ===");
    console.log("req.user:", req.user);
    console.log("req.user._id:", req.user._id);
    
    const reviews = await Review.find({ tutor: req.user._id })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    console.log("Found reviews:", reviews.length);
    
    res.status(200).json(reviews);
  } catch (err) {
    console.error("Error in getReviewsByUser:", err);
    res.status(500).json({ message: err.message, stack: err.stack });
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