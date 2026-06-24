const { Router } = require("express");
const { whopWebhookHandler, createCheckout, getCredits } = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");

const router = Router();

// Webhook must use raw body for Whop's signature verification — registered
// with express.raw() here, and must come BEFORE any global express.json()
// middleware in app.js/server.js for this specific path, or Express will
// have already parsed/consumed the body and signature verification will fail.
router.post("/webhook/whop", require("express").raw({ type: "application/json" }), whopWebhookHandler);

// Authenticated routes
router.post("/checkout", protect, createCheckout);
router.get("/credits", protect, getCredits);

module.exports = router;