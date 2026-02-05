const express = require("express")
const { getBookingByTutor, book, getBookingByStudent, confirmBooking, declineBooking } = require("../controllers/bookingController")
const { protect } = require("../middleware/authMiddleware")
const router = express.Router()


router.get("/tutor", protect, getBookingByTutor)
router.get("/student", protect, getBookingByStudent)
router.post("/:id",protect, book)
router.put("/accept/:id", protect, confirmBooking)
router.put("/decline/:id", protect, declineBooking)

module.exports = router