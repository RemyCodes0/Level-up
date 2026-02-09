const Booking = require("../models/Booking");
const Tutor = require("../models/Tutor");
const User = require("../models/User");
// const { sendTutorBookingEmail } = require("../services/emailService");
const sendEmail = require("../services/emailService");

exports.getBookingByTutor = async (req, res) => {
  try {
    const booking = await Booking.find({ student: req.user._id })
      .populate({
        path: "tutor",
        select: "bio user",
        populate: {
          path: "user",
          select: "name email",
        },
      })
      .populate("student", "name email")
      .sort({ createdAt: -1 });
    if (!booking || booking.length === 0)
      return res.status(404).json({ message: "No booking for this tutor" });
    res.status(200).json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getBookingByStudent = async (req, res) => {
  try {
    const booking = await Booking.find({ student: req.user._id })
      .populate({
        path: "tutor",
        select: "bio user",
        populate: {
          path: "user",
          select: "name email",
        },
      })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    if (!booking || booking.length === 0)
      return res.status(404).json({ message: "No booking for this student" });
    res.status(200).json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.book = async (req, res) => {
  try {
    const { slot, subject, duration, notes, totalAmount } = req.body;
    const existing = await Booking.findOne({
      tutor: req.params.id,
      "slot.day": slot.day,
      "slot.from": slot.from,
      status: { $in: ["pending", "confirmed"] },
    });
    if (existing)
      return res.status(400).json({ message: "slot already booked" });
    const booking = new Booking({
      tutor: req.params.id,
      student: req.user._id,
      slot,
      subject,
      duration,
      totalAmount,
      notes,
    });

    await booking.save();
    const tutor = await Tutor.findById(req.params.id).populate(
      "user",
      "name email",
    );

    await sendEmail({
      to: tutor.user.email,
      subject: "New Booking Notification",
      text: `Hi ${tutor.user.name},\n\nYou have a new booking for ${subject} on ${slot.day} from ${slot.from} to ${slot.to}.\n\nNotes: ${notes || "None"}\nTotal Amount: $${totalAmount}\n\n- Tutor Booking App`,
      html: `<p>Hi <b>${tutor.user.name}</b>,</p>
             <p>You have a new booking for <b>${subject}</b> on <b>${slot.day}</b> from <b>${slot.from}</b> to <b>${slot.to}</b>.</p>
             <p><b>Notes:</b> ${notes || "None"}</p>
             <p><b>Total Amount:</b> $${totalAmount}</p>
             <p>Time to Level Up!!!✨</p>`,
    });

    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.confirmBooking = async (req, res) => {
  try {
    const book = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: "confirmed" },
      { new: true },
    )
    .populate({
        path: "tutor",
        select: "bio user",
        populate: {
          path: "user",
          select: "name email",
        },
      })  
      .populate({
      path: "student",
      select: "name email",
    })
    
    if (!book) {
      return res.status(404).json({ message: "Booking not found" });
    }

     await sendEmail({
      to: book.student.email,
      subject: "Your Booking is Confirmed!",
      text: `Hi ${book.student.name},\n\nYour booking with ${book.tutor.name} for ${book.subject} on ${book.slot.day} from ${book.slot.from} to ${book.slot.to} has been confirmed.\n\nThank you for booking!\n\n- Tutor Booking App`,
      html: `<p>Hi <b>${book.student.name}</b>,</p>
             <p>Your booking with <b>${book.tutor.name}</b> for <b>${book.subject}</b> on <b>${book.slot.day}</b> from <b>${book.slot.from}</b> to <b>${book.slot.to}</b> has been <b>confirmed</b>.</p>
             <p>Thank you for booking!</p>
             <p>Time to Level Up!!!✨</p>`,
    });

    res.status(200).json(book);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.declineBooking = async (req, res) => {
  try {
    const book = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: "canceled" },
      { new: true }
    )
      .populate({
        path: "tutor",
        select: "bio user",
        populate: { path: "user", select: "name email" },
      })
      .populate({
        path: "student",
        select: "name email",
      });

    if (!book) {
      return res.status(404).json({ message: "Booking not found" });
    }

 
    await sendEmail({
      to: book.student.email,
      subject: "Your Booking Was Declined",
      text: `Hi ${book.student.name},\n\nYour booking with ${book.tutor.user.name} for ${book.subject} on ${book.slot.day} from ${book.slot.from} to ${book.slot.to} has been declined.\n\nWe apologize for the inconvenience.\n\n- Tutor Booking App`,
      html: `<p>Hi <b>${book.student.name}</b>,</p>
             <p>Your booking with <b>${book.tutor.user.name}</b> for <b>${book.subject}</b> on <b>${book.slot.day}</b> from <b>${book.slot.from}</b> to <b>${book.slot.to}</b> has been <b>declined</b>.</p>
             <p>We apologize for the inconvenience.</p>
             <p>Time to Level Up!!!✨</p>`,
    });

    res.status(200).json(book);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

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
