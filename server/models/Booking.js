const mongoose = require("mongoose")


const bookingSchema = new mongoose.Schema({
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TutorApplication",
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  slot: {
    day: String,
    from: String,
    to: String,
  },
  location: {
    type: String,
    required: false,
  },
  subject: {
    type: String,
    required: true,
  },
  duration: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "completed", "canceled"],
    default: "pending",
  },
  totalAmount: {
    type: Number,
  },
}, { timestamps: true });

// Every booking list endpoint filters by tutor or student and sorts by
// createdAt (bookingController.js) — without these, each query is a full
// collection scan.
bookingSchema.index({ tutor: 1, createdAt: -1 });
bookingSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema)