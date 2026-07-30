const express = require("express")
const { getBookingByTutor, book, getBookingByStudent, confirmBooking, declineBooking, hasBookedTutor, getAllBookings, adminCancelBooking } = require("../controllers/bookingController")
const { protect } = require("../middleware/authMiddleware")
const { requireAdmin } = require("../middleware/requireAdmin")
const router = express.Router()


router.get("/tutor", protect, getBookingByTutor)
// Admin-only: returns EVERY user's bookings — previously only required being
// logged in as ANY user, not specifically the admin.
router.get("/allBookings", protect, requireAdmin, getAllBookings)
router.get("/student", protect, getBookingByStudent)
router.post("/:id",protect, book)
router.put("/accept/:id", protect, confirmBooking)
router.put("/decline/:id", protect, declineBooking)
router.put("/admin/cancel/:id", protect, requireAdmin, adminCancelBooking)
router.get("/hasBooked/:tutorId", protect, hasBookedTutor);

module.exports = router