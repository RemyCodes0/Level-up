const { Router } = require("express");
const { whopWebhookHandler, createCheckout, getCredits } = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");

const router = Router();

// Webhook must receive the raw body — express.raw() here captures it before
// any global express.json() middleware can parse/consume it.
// This route must also be registered BEFORE express.json() in server.js/app.js,
// or the body will already be parsed and Whop's signature check will fail.
router.post(
  "/webhook/whop",
  require("express").raw({ type: "*/*" }), // "*/*" catches all content-types Whop may send
  whopWebhookHandler
);

// Authenticated routes
router.post("/checkout", protect, createCheckout);
router.get("/credits", protect, getCredits);

module.exports = router;