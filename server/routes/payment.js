const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  checkoutHandler,
  webhookHandler,
  creditsHandler,
} = require("../controllers/notchpayController");

// POST /api/payment/checkout — authenticated, JSON body
// Initializes a NotchPay payment and returns the hosted checkout URL.
router.post("/checkout", protect, checkoutHandler);

// POST /api/payment/webhook — NO auth, raw body required for signature verification.
// express.raw() gives us the raw Buffer so we can HMAC-verify it before parsing.
// This MUST come before any global express.json() middleware for this route.
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  webhookHandler
);

// GET /api/payment/credits — authenticated
// Returns the user's current credit balance and canGenerate flag.
router.get("/credits", protect, creditsHandler);

module.exports = router;