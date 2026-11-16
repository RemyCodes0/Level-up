// controllers/whopController.js
//
// Whop (https://whop.com) for one-time credit purchases — additive, alongside
// the existing Stripe/Tap/NotchPay controllers.
//
// Flow:
//   1. POST /api/payment/whop/checkout (authenticated) creates a Whop
//      checkout configuration for PRODUCT_PLAN with the logged-in user's id
//      in its metadata, and returns the hosted purchase URL.
//   2. Whop calls POST /api/webhooks/whop (configured once in the Whop
//      dashboard) with a `payment.succeeded` event. Payments inherit the
//      checkout configuration's metadata, which is how the webhook knows who
//      to credit. The signature is verified (Standard Webhooks) BEFORE
//      anything is trusted.
//   3. The credits are granted through creditService.grantCredits, exactly
//      once per Whop payment id (see processedWhopPayments on User).
//
// Env (server/.env):
//   PRODUCT_WHOP_API  Whop API key (apik_...)
//   PRODUCT_PLAN      the plan id (plan_...) that sells the credit pack
//   webhook_secret    the webhook signing secret (ws_...)
//   WHOP_PACK_CREDITS optional, credits one purchase grants (default 60 —
//                     the plan is "60 credits")
// Also accepted: WHOP_API_KEY / WHOP_PLAN_ID / WHOP_WEBHOOK_SECRET.

const Whop = require("@whop/sdk").default || require("@whop/sdk");
const User = require("../models/User");
const { grantCredits } = require("../services/creditService");

const API_KEY = process.env.PRODUCT_WHOP_API || process.env.WHOP_API_KEY;
const PLAN_ID = process.env.PRODUCT_PLAN || process.env.WHOP_PLAN_ID;
const WEBHOOK_SECRET = process.env.webhook_secret || process.env.WHOP_WEBHOOK_SECRET;
const PACK_CREDITS = Number(process.env.WHOP_PACK_CREDITS) || 60;
const CLIENT_URL = process.env.CLIENT_URL || "https://leveluppedu.app";

const PROD_ORIGINS = ["https://levelup-snowy.vercel.app", "https://leveluppedu.app"];

if (!API_KEY || !PLAN_ID) console.warn("[boot] PRODUCT_WHOP_API / PRODUCT_PLAN not set — Whop checkout is disabled.");
if (!WEBHOOK_SECRET) console.warn("[boot] webhook_secret not set — Whop webhooks will be rejected.");

// Whop's docs have you base64-encode the ws_... secret for the SDK, which
// follows the Standard Webhooks spec (it expects a base64 key).
const whop = new Whop({
  apiKey: API_KEY || "unset",
  webhookKey: WEBHOOK_SECRET ? Buffer.from(WEBHOOK_SECRET).toString("base64") : null,
});

// Where Whop sends the buyer afterwards. Uses the page the request came from
// when it's localhost (dev) or one of our known sites, so testing locally
// returns to localhost even though CLIENT_URL points at production.
function returnBase(req) {
  const origin = req.headers.origin;
  if (origin && (PROD_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin))) return origin;
  return CLIENT_URL;
}

// ── POST /api/payment/whop/checkout ──────────────────────────────────────
async function createCheckoutSession(req, res) {
  try {
    if (!API_KEY || !PLAN_ID) return res.status(500).json({ error: "Payment system not configured" });

    const user = req.user;
    // Called directly rather than through the SDK: the installed SDK version
    // still sends the legacy `plan_id` shape, which Whop now rejects with
    // "variant_id is required". In the current API a plan id is passed as
    // `variant_id`. Metadata is copied onto the resulting payment, which is
    // how the webhook knows who to credit.
    const body = {
      variant_id: PLAN_ID,
      metadata: { userId: user._id.toString(), credits: PACK_CREDITS },
    };
    // Whop only accepts an https redirect, so local testing (http://localhost)
    // skips it and the buyer stays on Whop's confirmation page.
    const redirect = `${returnBase(req)}/ai_tutor?payment=success`;
    if (redirect.startsWith("https://")) body.redirect_url = redirect;

    const response = await fetch("https://api.whop.com/api/v1/checkout_configurations", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.purchase_url) {
      console.error("[whop] Create checkout failed:", response.status, JSON.stringify(config).slice(0, 300));
      return res.status(502).json({ message: "Failed to create checkout session" });
    }

    console.log(`[whop] Checkout created for user ${user._id}, config ${config.id}`);
    res.json({ checkoutUrl: config.purchase_url });
  } catch (err) {
    console.error("[whop] createCheckoutSession error:", err.message);
    res.status(502).json({ message: "Failed to create checkout session" });
  }
}

// Credits one verified payment.succeeded event. Returns a short status string
// (used by the handler's log and by the response body, handy when testing).
async function creditPayment(payment) {
  const paymentId = payment?.id;
  if (!paymentId) return "ignored: no payment id";

  // Only OUR credit plan grants credits — the same Whop company can sell
  // other things, and their webhooks arrive at this same endpoint.
  if (PLAN_ID && payment.plan?.id !== PLAN_ID) return `ignored: plan ${payment.plan?.id} is not the credits plan`;

  const userId = payment.metadata?.userId;
  if (!userId) return "ignored: payment has no userId metadata";

  const credits = Number(payment.metadata?.credits) || PACK_CREDITS;

  // Idempotency: claim the payment id first with one atomic update, so two
  // simultaneous deliveries of the same event can never both pass. If the
  // grant then fails, the claim is released so Whop's retry can try again.
  const claimed = await User.findOneAndUpdate(
    { _id: userId, processedWhopPayments: { $ne: paymentId } },
    { $push: { processedWhopPayments: paymentId } },
    { new: true }
  ).select("_id");
  if (!claimed) {
    const exists = await User.exists({ _id: userId });
    return exists ? `duplicate: ${paymentId} already credited` : `ignored: user ${userId} not found`;
  }

  try {
    await grantCredits(userId, credits, "purchase", { provider: "whop", paymentId, planId: payment.plan?.id });
  } catch (err) {
    await User.findByIdAndUpdate(userId, { $pull: { processedWhopPayments: paymentId } });
    throw err;
  }
  return `credited ${credits} credits to user ${userId} (payment ${paymentId})`;
}

// ── POST /api/webhooks/whop ──────────────────────────────────────────────
// Mounted with express.raw() (see routes/whopWebhook.js): the signature is
// computed over the exact bytes Whop sent.
async function webhookHandler(req, res) {
  let event;
  try {
    const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    event = whop.webhooks.unwrap(body, { headers: req.headers });
  } catch (err) {
    console.warn("[whop webhook] Signature verification FAILED:", err.message);
    return res.status(400).json({ error: "invalid_signature" });
  }

  try {
    if (event.type !== "payment.succeeded") {
      return res.status(200).json({ received: true, result: `ignored: ${event.type}` });
    }
    const result = await creditPayment(event.data);
    console.log(`[whop webhook] ${result}`);
    res.status(200).json({ received: true, result });
  } catch (err) {
    // Non-2xx makes Whop retry — safe, the claim in creditPayment is released.
    console.error("[whop webhook] Processing error:", err.message);
    res.status(500).json({ error: "processing_failed" });
  }
}

// GET /api/webhooks/whop — a browser-visible check that the route is deployed
// and configured. Reveals no secrets.
function webhookStatus(_req, res) {
  res.json({
    ok: true,
    checkoutConfigured: !!(API_KEY && PLAN_ID),
    webhookSecretConfigured: !!WEBHOOK_SECRET,
    creditsPerPurchase: PACK_CREDITS,
  });
}

module.exports = { createCheckoutSession, webhookHandler, webhookStatus };
