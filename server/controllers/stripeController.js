// controllers/stripeController.js
//
// Stripe Checkout for one-time credit-pack purchases — a new, separate path
// alongside the existing NotchPay/Whop integrations (both left untouched).
// Credit packs/prices come from pricingConfigService.js (admin-adjustable,
// not hardcoded); the actual grant + ledger row is creditService.js's job,
// same as every other credit-mutating path in this feature.

const Stripe = require("stripe");
const User = require("../models/User");
const { grantCredits } = require("../services/creditService");
const { getCreditPack } = require("../services/pricingConfigService");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || "https://leveluppedu.app";

if (!STRIPE_SECRET_KEY) {
  console.warn("[boot] STRIPE_SECRET_KEY is not set — Stripe checkout will fail with an auth error.");
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.warn("[boot] STRIPE_WEBHOOK_SECRET is not set — Stripe webhook signature verification will fail.");
}

// A placeholder key lets the module load (and the rest of the server boot)
// even with Stripe unconfigured in a dev environment — real calls will fail
// with Stripe's own auth error, not a crash at require-time.
const stripe = new Stripe(STRIPE_SECRET_KEY || "sk_test_unconfigured");

// ── POST /api/payment/stripe/checkout ────────────────────────────────────────
// Body: { packKey }. Returns a hosted Stripe Checkout URL to redirect to.
async function createCheckoutSession(req, res) {
  try {
    const { packKey } = req.body;
    const pack = await getCreditPack(packKey);
    if (!pack) {
      return res.status(400).json({ error: "invalid_pack", message: "Select a valid credit pack." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: pack.priceCents,
            product_data: {
              name: `${pack.credits} Level Up credits`,
              description: "Non-expiring course-generation credits",
            },
          },
          quantity: 1,
        },
      ],
      // metadata rides along on the session AND the resulting PaymentIntent —
      // the webhook reads it straight off session.metadata, no separate
      // lookup needed to know who paid for what.
      metadata: { userId: req.user._id.toString(), packKey: pack.key },
      success_url: `${CLIENT_URL}/ai_tutor?payment=success`,
      cancel_url: `${CLIENT_URL}/ai_tutor?payment=cancelled`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("[stripe] createCheckoutSession error:", err.message);
    res.status(502).json({ message: "Failed to create checkout session" });
  }
}

// ── POST /api/payment/stripe/webhook ─────────────────────────────────────────
// NO auth, raw body required for signature verification (mounted the same
// way as the existing NotchPay webhook — see routes/payment.js).
async function webhookHandler(req, res) {
  let event;
  try {
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // Never treat a bad signature as a retryable server error — this is
    // exactly the code path an attacker forging webhook calls would be
    // probing, so a clean 400 (not a 500 Stripe would retry) is correct here.
    console.error("[stripe webhook] Signature verification FAILED:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Respond fast so Stripe doesn't retry unnecessarily — all real work
  // happens after, same pattern as the existing NotchPay webhook.
  res.status(200).json({ received: true });

  if (event.type !== "checkout.session.completed") return;

  try {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const packKey = session.metadata?.packKey;
    if (!userId || !packKey) {
      console.warn("[stripe webhook] Missing userId/packKey in session metadata:", session.id);
      return;
    }

    // Idempotency — Stripe both CAN and DOES redeliver the same event; this
    // must never grant credits twice for one purchase.
    const alreadyProcessed = await User.findOne({ processedStripeEvents: event.id }).select("_id").lean();
    if (alreadyProcessed) return;

    const pack = await getCreditPack(packKey);
    if (!pack) {
      console.error("[stripe webhook] Unknown packKey in session metadata:", packKey);
      return;
    }

    await grantCredits(userId, pack.credits, "purchase", {
      packKey,
      sessionId: session.id,
      stripeEventId: event.id,
    });
    await User.findByIdAndUpdate(userId, { $push: { processedStripeEvents: event.id } });

    console.log(
      `[stripe webhook] Credited ${pack.credits} credits to user ${userId} (pack ${packKey}, event ${event.id}).`
    );
  } catch (err) {
    console.error("[stripe webhook] Unhandled error:", err.message);
  }
}

module.exports = { createCheckoutSession, webhookHandler };
