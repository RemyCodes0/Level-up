const { Router } = require("express");
const { handleWebhook, createCheckout, getCredits } = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");

const router = Router();

// Webhook must use raw body — registered before express.json() in app.js
router.post("/webhook", handleWebhook);

// Authenticated routes
router.post("/checkout", protect, createCheckout);
router.get("/credits", protect, getCredits);

module.exports = router;