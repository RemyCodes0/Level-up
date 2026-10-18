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
const {
  createCheckoutSession: tapCheckoutHandler,
  webhookHandler: tapWebhookHandler,
} = require("../controllers/tapController");
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
// FIX (found 2026-10-18, while wiring up Tap below): this whole router is
// mounted BEFORE app.js's global express.json() and never falls through to
// the second post-json() mount once a route here matches — so without its
// own body-parser, req.body was always undefined here, and
// stripeCheckoutHandler's `req.body.packKey` destructure threw on every
// single call (caught by its try/catch, surfacing as a generic 502 "Failed
// to create checkout session" with no indication the body was never parsed).
// Confirmed via an isolated reproduction of this exact double-mount/ordering
// pattern before changing it. express.json() here is scoped to this one
// route, same way express.raw() below is scoped to the webhook route only.
router.post("/stripe/checkout", express.json(), protect, stripeCheckoutHandler);

// POST /api/payment/stripe/webhook — NO auth, raw body required for Stripe's
// signature verification, same reasoning/placement as the NotchPay webhook
// above (this whole router is mounted before express.json() in app.js).
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

// ── Tap Payments — credit-pack purchases (new, additive) ─────────────────
// POST /api/payment/tap/checkout — authenticated, JSON body { packKey }.
router.post("/tap/checkout", express.json(), protect, tapCheckoutHandler);

// POST /api/payment/tap/webhook — NO auth. Tap signs a hand-built string
// (not a raw-body HMAC — see tapController.verifyTapWebhookSignature), so
// this needs ordinary JSON parsing, not express.raw() like the webhooks
// above.
router.post("/tap/webhook", express.json(), tapWebhookHandler);

module.exports = router;