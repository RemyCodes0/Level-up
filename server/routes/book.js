const express = require("express")
const { getBookingByTutor, book, getBookingByStudent, confirmBooking, declineBooking, hasBookedTutor, getAllBookings } = require("../controllers/bookingController")
const { protect } = require("../middleware/authMiddleware")
const router = express.Router()


router.get("/tutor", protect, getBookingByTutor)
router.get("/allBookings", protect, getAllBookings)
router.get("/student", protect, getBookingByStudent)
router.post("/:id",protect, book)
router.put("/accept/:id", protect, confirmBooking)
router.put("/decline/:id", protect, declineBooking)
router.get("/hasBooked/:tutorId", protect, hasBookedTutor);

module.exports = router