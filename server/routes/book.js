const express = require("express")
const { getBooking, book } = require("../controllers/bookingController")
const { protect } = require("../middleware/authMiddleware")
const router = express.Router()


router.get("/:id", getBooking)
router.post("/:id",protect, book)

module.exports = router