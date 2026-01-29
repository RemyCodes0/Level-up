const express = require("express")
const { getBookingByTutor, book, getBookingByStudent } = require("../controllers/bookingController")
const { protect } = require("../middleware/authMiddleware")
const router = express.Router()


router.get("/:id/tutor", getBookingByTutor)
router.get("/:id/student", getBookingByStudent)
router.post("/:id",protect, book)

module.exports = router