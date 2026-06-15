const Booking = require("../models/Booking");
const Tutor = require("../models/Tutor");
const sendEmail = require("../services/emailService");

// ── Get all bookings (admin use) ─────────────────────────────────────────────
exports.getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate({
        path: "tutor",
        select: "bio user location",
        populate: { path: "user", select: "name email" },
      })
      .populate({ path: "student", select: "name email" })
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get bookings where the logged-in user is the tutor ───────────────────────
exports.getBookingByTutor = async (req, res) => {
  try {
    // Find the Tutor record that belongs to this user
    const tutor = await Tutor.findOne({ user: req.user._id }).select("_id");
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    const bookings = await Booking.find({ tutor: tutor._id })
      .populate({
        path: "tutor",
        select: "bio user",
        populate: { path: "user", select: "name email" },
      })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get bookings where the logged-in user is the student ─────────────────────
exports.getBookingByStudent = async (req, res) => {
  try {
    const bookings = await Booking.find({ student: req.user._id })
      .populate({
        path: "tutor",
        select: "bio user",
        populate: { path: "user", select: "name email" },
      })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Book a tutor ─────────────────────────────────────────────────────────────
exports.book = async (req, res) => {
  try {
    const { slot, subject, location, duration, notes, totalAmount } = req.body;

    // Prevent double-booking the same slot
    const existing = await Booking.findOne({
      tutor: req.params.id,
      "slot.day": slot.day,
      "slot.from": slot.from,
      status: { $in: ["pending", "confirmed"] },
    });
    if (existing) {
      return res.status(400).json({ message: "This slot is already booked" });
    }

    const booking = await Booking.create({
      tutor: req.params.id,
      student: req.user._id,
      slot,
      location,
      subject,
      duration,
      totalAmount,
      notes,
    });

    // Notify the tutor by email (non-blocking — don't fail the booking if email fails)
    try {
      const tutor = await Tutor.findById(req.params.id).populate("user", "name email");
      if (tutor?.user?.email) {
        await sendEmail({
          to: tutor.user.email,
          subject: "New Booking — Level Up",
          html: `
            <p>Hi <b>${tutor.user.name}</b>,</p>
            <p>You have a new booking for <b>${subject}</b> on <b>${slot.day}</b>
            from <b>${slot.from}</b> to <b>${slot.to}</b>.</p>
            <p><b>Location:</b> ${location || "To be determined"}</p>
            <p><b>Notes:</b> ${notes || "None"}</p>
            <p><b>Total Amount:</b> $${totalAmount}</p>
            <p>Time to Level Up! ✨</p>
          `,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send booking notification email (non-fatal):", emailErr.message);
    }

    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Confirm a booking ─────────────────────────────────────────────────────────
exports.confirmBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: "confirmed" },
      { new: true }
    )
      .populate({
        path: "tutor",
        select: "bio user",
        populate: { path: "user", select: "name email" },
      })
      .populate("student", "name email");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    try {
      if (booking.student?.email) {
        await sendEmail({
          to: booking.student.email,
          subject: "Your Booking is Confirmed — Level Up",
          html: `
            <p>Hi <b>${booking.student.name}</b>,</p>
            <p>Your booking for <b>${booking.subject}</b> on <b>${booking.slot.day}</b>
            from <b>${booking.slot.from}</b> to <b>${booking.slot.to}</b> has been <b>confirmed</b>.</p>
            <p>Time to Level Up! ✨</p>
          `,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send confirmation email (non-fatal):", emailErr.message);
    }

    res.status(200).json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Decline a booking ─────────────────────────────────────────────────────────
exports.declineBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: "canceled" },
      { new: true }
    )
      .populate({
        path: "tutor",
        select: "bio user",
        populate: { path: "user", select: "name email" },
      })
      .populate("student", "name email");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    try {
      if (booking.student?.email) {
        await sendEmail({
          to: booking.student.email,
          subject: "Your Booking Was Declined — Level Up",
          html: `
            <p>Hi <b>${booking.student.name}</b>,</p>
            <p>Your booking for <b>${booking.subject}</b> on <b>${booking.slot.day}</b>
            from <b>${booking.slot.from}</b> to <b>${booking.slot.to}</b> has been <b>declined</b>.</p>
            <p>We apologize for the inconvenience.</p>
            <p>Time to Level Up! ✨</p>
          `,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send decline email (non-fatal):", emailErr.message);
    }

    res.status(200).json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Check if the logged-in user has booked a specific tutor ──────────────────
exports.hasBookedTutor = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      tutor: req.params.tutorId,
      student: req.user._id,
      status: { $in: ["pending", "confirmed", "completed"] },
    });

    res.json({ hasBooked: !!booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};