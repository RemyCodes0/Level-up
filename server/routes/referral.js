// routes/referral.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getReferralLink } = require("../controllers/referralController");

// GET /api/referral/link — returns referral code, link, and progress
router.get("/link", protect, getReferralLink);

module.exports = router;