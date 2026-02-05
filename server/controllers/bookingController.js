const Booking = require("../models/Booking");

exports.getBookingByTutor = async (req, res) => {
  try {
    const booking = await Booking.find({ student: req.user._id })
      .populate({
        path: "tutor",
        select: "bio user",
        populate:{
          path: "user",
          select: "name email"
        }
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
    const booking =
      await Booking.find({ student: req.user._id })
        .populate({
          path: "tutor",
          select: "bio user",
          populate:{
            path:"user",
            select: "name email"
          }
        })
        .populate("student", "name email")
        .sort({createdAt:-1})


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
    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.confirmBooking = async(req, res)=>{
  try {
    const book = await Booking.findByIdAndUpdate(req.params.id, {status: "confirmed"}, {new:true})
    if(!book){
      return res.status(404).json({message: "Booking not found"})

    }

    res.status(200).json(book)
    
  } catch (error) {
    res.status(500).json({message:error.message})
  }
}


exports.declineBooking = async(req,res)=>{
  try {
    const book = await Booking.findByIdAndUpdate(req.params.id, {status: "canceled"},{new: true})
    if(!book){
      return res.status(404).json({message: "No booking found"})

    }
    res.status(200).json(book)
  } catch (error) {
    res.status(500).json({message: error.message})
  }
}
