// controllers/paymentController.js

const User = require("../models/User");
const { Whop } = require("@whop/sdk");

const WHOP_API_KEY = process.env.WHOP_API_KEY;
const WHOP_PLAN_ID = process.env.WHOP_PLAN_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ──────────────────────────────────────────────────────────────────────────
// SECRET SETUP — logged once at boot so misconfiguration is visible
// immediately in Render's startup logs, not just when a webhook fires.
// ──────────────────────────────────────────────────────────────────────────
// Per Whop's docs (docs.whop.com/developer/guides/webhooks), the SDK wants
// the constructor option `webhookKey`, set to btoa(rawSecret) — i.e. plain
// base64 of the whole "ws_..." string, no hex decoding, no prefix removal.
function buildWebhookKey(raw) {
  if (!raw) {
    console.error("[boot] WHOP_WEBHOOK_SECRET is missing from environment!");
    throw new Error("WHOP_WEBHOOK_SECRET is not set");
  }
  // Never log the secret itself (raw or base64-encoded) — logs are not a
  // secure store, and this key is exactly what an attacker needs to forge
  // webhook signatures.
  return Buffer.from(raw, "utf8").toString("base64");
}

console.log("[boot] Whop config present — API key:", !!WHOP_API_KEY, "| plan id:", !!WHOP_PLAN_ID);

const WHOP_WEBHOOK_KEY = buildWebhookKey(process.env.WHOP_WEBHOOK_SECRET);

// ──────────────────────────────────────────────────────────────────────────
// POST /api/payment/checkout
// ──────────────────────────────────────────────────────────────────────────
exports.createCheckout = async (req, res) => {
  try {
    const client = new Whop({ apiKey: WHOP_API_KEY });

    const session = await client.checkoutConfigurations.create({
      planId: WHOP_PLAN_ID,
      metadata: { userId: req.user._id.toString() },
      redirectUrl: `${FRONTEND_URL}/ai_tutor?payment=success`,
    });

    const checkoutUrl = session.purchase_url;
    if (!checkoutUrl) {
      console.error("[checkout] No purchase_url in Whop response for user:", req.user._id.toString());
      return res.status(502).json({ message: "Checkout session created but no URL returned" });
    }

    res.json({ checkoutUrl });
  } catch (err) {
    console.error("[checkout] Whop checkout creation failed for user:", req.user?._id?.toString(), "-", err?.message || err);
    return res.status(502).json({ message: "Failed to create checkout session" });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// GET /api/payment/credits
// ──────────────────────────────────────────────────────────────────────────
exports.getCredits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("courseCredits freeTrialUsed feedbackCreditGranted").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      courseCredits: user.courseCredits ?? 0,
      freeTrialUsed: !!user.freeTrialUsed,
      canGenerate: !user.freeTrialUsed || (user.courseCredits ?? 0) > 0,
      // Lets the feedback modal show/hide its one-time "+20 credits" banner
      // without a dedicated endpoint — this route is already polled by
      // fetchCredits() on load and after feedback submission.
      feedbackCreditGranted: !!user.feedbackCreditGranted,
    });
  } catch (err) {
    console.error("[credits] getCredits error:", err.message);
    res.status(500).json({ message: "Failed to fetch credits" });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// POST /api/payment/webhook/whop
// ──────────────────────────────────────────────────────────────────────────
exports.whopWebhookHandler = async (req, res) => {
  // Always respond 200 quickly so Whop doesn't retry unnecessarily.
  // All real work happens after the response is sent.
  res.status(200).send("OK");

  console.log("======== WHOP WEBHOOK HANDLER START ========");

  try {
    const client = new Whop({
      apiKey: WHOP_API_KEY,
      webhookKey: WHOP_WEBHOOK_KEY,
    });

    if (!Buffer.isBuffer(req.body)) {
      console.error("[webhook] req.body is NOT a Buffer — express.raw() did not run correctly. Typeof:", typeof req.body);
      return;
    }

    const rawBody = req.body.toString("utf8");
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
    );

    let webhookData;
    try {
      webhookData = client.webhooks.unwrap(rawBody, { headers });
    } catch (sigErr) {
      // Never log the webhook secret here, even on failure — it's a
      // credential, and this is exactly the code path an attacker probing
      // signature verification would be watching the logs during.
      console.error("[webhook] Signature verification FAILED:", sigErr.message, "| webhook-id:", headers["webhook-id"]);
      return;
    }

    const eventType = webhookData.action || webhookData.type || "";

    const PAYMENT_EVENTS = [
      "payment.succeeded",
      "invoice_paid",
      "membership_activated",
      "membership.created",
      "payment.completed",
    ];

    if (!PAYMENT_EVENTS.includes(eventType)) {
      return;
    }

    const payload = webhookData.data;
    const userId = payload?.metadata?.userId;

    if (!userId) {
      console.warn("[webhook] No userId in metadata for event:", eventType);
      return;
    }

    const paymentId = payload?.id;

    if (paymentId) {
      const alreadyProcessed = await User.findOne({ processedWebhooks: paymentId }).select("_id").lean();
      if (alreadyProcessed) {
        return;
      }
    } else {
      console.warn("[webhook] No payment ID found on payload — idempotency check skipped, risk of double-credit");
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { courseCredits: 1 },
        ...(paymentId ? { $push: { processedWebhooks: paymentId } } : {}),
      },
      { new: true }
    );

    if (!updated) {
      console.error("[webhook] User not found in DB for userId:", userId);
      return;
    }

    console.log(
      `[webhook] Credited 1 course credit to user ${userId} (payment ${paymentId}). New balance: ${updated.courseCredits}`
    );
  } catch (err) {
    console.error("[webhook] Unhandled error in whopWebhookHandler:", err.message);
  }
};