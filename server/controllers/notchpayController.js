const crypto = require("crypto");
const User = require("../models/User");

// ── Config ────────────────────────────────────────────────────────────────────
// NOTCHPAY_PUBLIC_KEY  — from your NotchPay dashboard (Settings → Developer)
// NOTCHPAY_WEBHOOK_SECRET — from your NotchPay dashboard (Settings → Developer → Webhooks)
// CLIENT_URL — your frontend URL (e.g. https://leveluppedu.app), no trailing slash

const NOTCHPAY_PUBLIC_KEY = process.env.NOTCHPAY_PUBLIC_KEY;
const NOTCHPAY_WEBHOOK_SECRET = process.env.NOTCHPAY_WEBHOOK_SECRET;

// $4.99 in USD cents. NotchPay accepts amounts in the smallest currency unit
// (cents for USD). 499 = $4.99.
const COURSE_PRICE_CENTS = 499;
const CURRENCY = "USD";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Verifies the X-Notch-Signature header using HMAC-SHA256 against your
// webhook secret. MUST run on the raw request body string (not parsed JSON)
// so the byte representation matches what NotchPay signed.
function verifyWebhookSignature(rawBody, signature) {
  if (!NOTCHPAY_WEBHOOK_SECRET) {
    console.error("[notchpay] NOTCHPAY_WEBHOOK_SECRET is not set — webhook verification skipped (UNSAFE)");
    return true; // allow in dev if secret not configured, never in prod
  }
  const expected = crypto
    .createHmac("sha256", NOTCHPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

// ── POST /api/payment/checkout ────────────────────────────────────────────────
// Called by PaywallModal when the user clicks "Buy more courses".
// Initializes a NotchPay payment and returns the hosted checkout URL.
// The frontend redirects the user there; after payment, NotchPay redirects
// them back to CLIENT_URL/ai_tutor?payment=success (which the frontend
// already handles to refresh credits).
async function checkoutHandler(req, res) {
  try {
    if (!NOTCHPAY_PUBLIC_KEY) {
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Unique reference for this transaction — used to identify it in the
    // webhook and to prevent double-crediting the same payment.
    const reference = `levelup_${user._id}_${Date.now()}`;

    const callbackUrl = `${process.env.CLIENT_URL}/ai_tutor?payment=success`;

    const body = {
      amount: COURSE_PRICE_CENTS,
      currency: CURRENCY,
      email: user.email,
      reference,
      callback: callbackUrl,
      description: "Level Up AI — 1 course credit",
    };

    const response = await fetch("https://api.notchpay.co/payments/initialize", {
      method: "POST",
      headers: {
        "Authorization": NOTCHPAY_PUBLIC_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.transaction?.authorization_url) {
      console.error("[notchpay] Initialize failed:", JSON.stringify(data));
      return res.status(502).json({
        error: "Failed to create checkout. Please try again.",
        detail: data?.message || "Unknown error from NotchPay",
      });
    }

    console.log(`[notchpay] Checkout initialized for user ${user._id}, ref: ${reference}`);
    res.json({ checkoutUrl: data.transaction.authorization_url });
  } catch (err) {
    console.error("[notchpay] checkoutHandler error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/payment/webhook ──────────────────────────────────────────────────
// NotchPay calls this when a payment completes (or fails). Must respond 200
// immediately — any other status code causes NotchPay to retry.
//
// IMPORTANT: this route must use express.raw() middleware (not express.json())
// so we receive the raw body string for signature verification. See routes file.
async function webhookHandler(req, res) {
  // Always respond 200 first — NotchPay considers anything else a failure
  // and will retry, which could double-credit users.
  res.status(200).send("ok");

  try {
    const signature = req.headers["x-notch-signature"];
    const rawBody = req.body.toString("utf8");

    if (!signature) {
      console.warn("[notchpay] Webhook received with no signature — ignoring");
      return;
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn("[notchpay] Webhook signature verification FAILED — ignoring");
      return;
    }

    const event = JSON.parse(rawBody);
    console.log(`[notchpay] Webhook received: ${event.event}, ref: ${event.data?.reference}`);

    if (event.event !== "payment.complete") {
      // payment.failed and others — nothing to do on our side
      return;
    }

    const payment = event.data;
    if (!payment?.reference) {
      console.warn("[notchpay] payment.complete event with no reference — ignoring");
      return;
    }

    // Reference format: "levelup_{userId}_{timestamp}"
    const parts = payment.reference.split("_");
    if (parts.length < 3 || parts[0] !== "levelup") {
      console.warn(`[notchpay] Unrecognised reference format: ${payment.reference}`);
      return;
    }

    const userId = parts[1];

    // Idempotency: check if we already credited this reference. We store it
    // in the user's paymentRefs array. If it's already there, skip.
    const user = await User.findById(userId);
    if (!user) {
      console.error(`[notchpay] Webhook: user ${userId} not found`);
      return;
    }

    if (user.paymentRefs?.includes(payment.reference)) {
      console.warn(`[notchpay] Duplicate webhook for ref ${payment.reference} — skipping`);
      return;
    }

    // Add 1 credit and record the reference so we never double-credit.
    await User.findByIdAndUpdate(userId, {
      $inc: { courseCredits: 1 },
      $push: { paymentRefs: payment.reference },
    });

    console.log(`[notchpay] ✓ Credited 1 course to user ${userId} (ref: ${payment.reference})`);
  } catch (err) {
    console.error("[notchpay] webhookHandler processing error:", err);
  }
}

// ── GET /api/payment/credits ───────────────────────────────────────────────────
// Returns the user's current credit balance. Called on page load and after
// payment redirect (?payment=success) to refresh the sidebar credit display.
async function creditsHandler(req, res) {
  try {
    const user = await User.findById(req.user._id).select("courseCredits freeTrialUsed");
    if (!user) return res.status(404).json({ error: "User not found" });

    const credits = Math.max(user.courseCredits || 0, 0);
    const freeTrialUsed = !!user.freeTrialUsed;
    // canGenerate: true if they have paid credits OR haven't used the free trial yet
    const canGenerate = credits > 0 || !freeTrialUsed;

    console.log(`[credits] Returning: ${JSON.stringify({ courseCredits: credits, freeTrialUsed, canGenerate })}`);
    res.json({ courseCredits: credits, freeTrialUsed, canGenerate });
  } catch (err) {
    console.error("[credits] Error:", err);
    res.status(500).json({ error: "Failed to fetch credits" });
  }
}

module.exports = { checkoutHandler, webhookHandler, creditsHandler };