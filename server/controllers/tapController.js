// controllers/tapController.js
//
// Tap Payments (https://tap.company) for one-time credit-pack purchases — a
// new, additive path alongside the existing NotchPay/Stripe integrations
// (both left untouched). Same shape as stripeController.js: packs come from
// pricingConfigService.js, the actual grant + ledger row is creditService's
// job, idempotency is a declared array field on User (NOT NotchPay's
// undeclared-field bug — see notchpayController.js's own known issue).
//
// Tap's flow differs from Stripe/NotchPay in one real way: there's no
// dashboard-configured webhook URL. The webhook target (`post.url`) is sent
// PER CHARGE in the create-charge request below, and Tap signs the webhook
// body with a hand-built string (not a raw-body HMAC like Stripe/NotchPay) —
// see verifyTapWebhookSignature for the exact field order, taken from
// https://developers.tap.company/docs/webhook.md (verified live 2026-10-18,
// not from memory/training — Tap's signing scheme is easy to get subtly
// wrong and a wrong scheme either silently blocks every real payment or
// opens a forged-credit hole).

const crypto = require("crypto");
const User = require("../models/User");
const { grantCredits } = require("../services/creditService");
const { getCreditPack } = require("../services/pricingConfigService");

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY;
const CLIENT_URL = process.env.CLIENT_URL || "https://leveluppedu.app";
// The backend's OWN public URL — needed because Tap calls `post.url` (set
// per-charge below), unlike Stripe/NotchPay whose webhook URL is configured
// once in their dashboard. In local dev this must be a publicly reachable
// tunnel (e.g. ngrok) for Tap to ever actually reach your webhook — a plain
// localhost value will never receive a callback.
const SERVER_URL = process.env.SERVER_URL || "https://level-up-2-dka7.onrender.com";

if (!TAP_SECRET_KEY) {
  console.warn("[boot] TAP_SECRET_KEY is not set — Tap checkout will fail with an auth error.");
}

// Tap requires amounts rounded to the currency's own decimal precision (2
// for USD/SAR/EUR/GBP/AED/QAR/EGP, 3 for BHD/KWD/OMR/JOD) — both when
// creating the charge AND when rebuilding the webhook's signed string below.
// Only USD is used anywhere in this app today; the map exists so adding a
// second currency later doesn't silently break signature verification.
const CURRENCY_DECIMALS = { BHD: 3, KWD: 3, OMR: 3, JOD: 3 };
function decimalsFor(currency) {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

// ── POST /api/payment/tap/checkout ───────────────────────────────────────
// Body: { packKey }. Returns a hosted Tap checkout URL to redirect to.
async function createCheckoutSession(req, res) {
  try {
    if (!TAP_SECRET_KEY) {
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const { packKey } = req.body;
    const pack = await getCreditPack(packKey);
    if (!pack) {
      return res.status(400).json({ error: "invalid_pack", message: "Select a valid credit pack." });
    }

    const user = req.user;
    const currency = "USD";
    const amount = Number((pack.priceCents / 100).toFixed(decimalsFor(currency)));
    const nameParts = (user.name || "Level Up user").trim().split(/\s+/);

    const response = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAP_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency,
        customer: {
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(" ") || undefined,
          email: user.email,
        },
        source: { id: "src_all" },
        redirect: { url: `${CLIENT_URL}/ai_tutor?payment=success` },
        post: { url: `${SERVER_URL}/api/payment/tap/webhook` },
        description: `${pack.credits} Level Up credits`,
        // Read back off the webhook's `metadata` field — see webhookHandler.
        metadata: { userId: user._id.toString(), packKey: pack.key },
      }),
    });

    const data = await response.json();

    if (!response.ok || !data?.transaction?.url) {
      console.error("[tap] Create charge failed:", JSON.stringify(data));
      return res.status(502).json({
        error: "Failed to create checkout. Please try again.",
        detail: data?.errors?.[0]?.description || data?.message || "Unknown error from Tap",
      });
    }

    console.log(`[tap] Checkout initialized for user ${user._id}, charge ${data.id}, pack ${pack.key}`);
    res.json({ checkoutUrl: data.transaction.url });
  } catch (err) {
    console.error("[tap] createCheckoutSession error:", err.message);
    res.status(502).json({ message: "Failed to create checkout session" });
  }
}

// Rebuilds Tap's signed string from the webhook payload's own fields and
// compares it against the `hashstring` header. MUST use the exact field
// order Tap documents: x_id, x_amount, x_currency, x_gateway_reference,
// x_payment_reference, x_status, x_created — each label glued directly to
// its value, no separators. amount must be re-formatted to the currency's
// decimal precision (JSON parsing can drop a trailing zero, e.g. 10.90 ->
// 10.9, which would silently break every signature check for amounts like
// that).
function verifyTapWebhookSignature(charge, signature) {
  if (!signature) return false;
  const amount = Number(charge.amount).toFixed(decimalsFor(charge.currency));
  const toSign =
    `x_id${charge.id}` +
    `x_amount${amount}` +
    `x_currency${charge.currency}` +
    `x_gateway_reference${charge.reference?.gateway || ""}` +
    `x_payment_reference${charge.reference?.payment || ""}` +
    `x_status${charge.status}` +
    `x_created${charge.transaction?.created}`;
  const expected = crypto.createHmac("sha256", TAP_SECRET_KEY).update(toSign).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// ── POST /api/payment/tap/webhook ────────────────────────────────────────
// Tap POSTs the charge object here (the exact `post.url` set per-charge
// above) once the charge's status changes. Respond fast, same pattern as
// the existing NotchPay/Stripe webhooks.
async function webhookHandler(req, res) {
  res.status(200).json({ received: true });

  try {
    const charge = req.body;
    if (!charge?.id) {
      console.warn("[tap webhook] Payload with no charge id — ignoring");
      return;
    }

    if (!verifyTapWebhookSignature(charge, req.headers["hashstring"])) {
      console.warn(`[tap webhook] Signature verification FAILED for charge ${charge.id} — ignoring`);
      return;
    }

    // CAPTURED is the only status that means funds actually settled —
    // AUTHORIZED/INITIATED/DECLINED/... must never credit.
    if (charge.status !== "CAPTURED") return;

    const userId = charge.metadata?.userId;
    const packKey = charge.metadata?.packKey;
    if (!userId || !packKey) {
      console.warn("[tap webhook] Missing userId/packKey in charge metadata:", charge.id);
      return;
    }

    // Idempotency — Tap can redeliver the same webhook; this must never
    // grant credits twice for one charge.
    const alreadyProcessed = await User.findOne({ processedTapEvents: charge.id }).select("_id").lean();
    if (alreadyProcessed) return;

    const pack = await getCreditPack(packKey);
    if (!pack) {
      console.error("[tap webhook] Unknown packKey in charge metadata:", packKey);
      return;
    }

    await grantCredits(userId, pack.credits, "purchase", { packKey, chargeId: charge.id });
    await User.findByIdAndUpdate(userId, { $push: { processedTapEvents: charge.id } });

    console.log(`[tap webhook] Credited ${pack.credits} credits to user ${userId} (pack ${packKey}, charge ${charge.id}).`);
  } catch (err) {
    console.error("[tap webhook] Unhandled error:", err.message);
  }
}

module.exports = { createCheckoutSession, webhookHandler };
