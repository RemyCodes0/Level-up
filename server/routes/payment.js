const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  checkoutHandler,
  webhookHandler,
  creditsHandler,
} = require("../controllers/notchpayController");
const { getPublicPricingConfig } = require("../controllers/pricingConfigController");
const {
  createCheckoutSession: stripeCheckoutHandler,
  webhookHandler: stripeWebhookHandler,
} = require("../controllers/stripeController");
const { getTransactions } = require("../controllers/creditsController");

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

// GET /api/payment/pricing-config — public (course tiers + credit packs,
// no secret data), consumed by the input-chat tier cards and the
// pricing/landing pages.
router.get("/pricing-config", getPublicPricingConfig);

// GET /api/payment/transactions — authenticated, cursor-paginated.
// Powers the credits dashboard's transaction history.
router.get("/transactions", protect, getTransactions);

// ── Stripe — credit-pack purchases (new, additive; NotchPay/Whop above are
// left untouched) ────────────────────────────────────────────────────────
// POST /api/payment/stripe/checkout — authenticated, JSON body { packKey }.
router.post("/stripe/checkout", protect, stripeCheckoutHandler);

// POST /api/payment/stripe/webhook — NO auth, raw body required for Stripe's
// signature verification, same reasoning/placement as the NotchPay webhook
// above (this whole router is mounted before express.json() in app.js).
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

module.exports = router;