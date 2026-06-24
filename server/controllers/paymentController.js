// controllers/paymentController.js

const User = require("../models/User");
const { Whop } = require("@whop/sdk");

const WHOP_API_KEY = process.env.WHOP_API_KEY;
const WHOP_PLAN_ID = process.env.WHOP_PLAN_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Whop gives secrets as "ws_..." but standardwebhooks (used internally by
// @whop/sdk) requires the format "whsec_<base64>". We transform it once at
// startup so every webhook call is ready to go.
function buildWebhookSecret(raw) {
  if (!raw) throw new Error("WHOP_WEBHOOK_SECRET is not set");
  if (raw.startsWith("whsec_")) return raw;

  const hex = raw.startsWith("ws_") ? raw.slice(3) : raw;

  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`WHOP_WEBHOOK_SECRET doesn't look like valid hex: ${raw}`);
  }

  const bytes = Buffer.from(hex, "hex");
  return "whsec_" + bytes.toString("base64");
}

const WHOP_WEBHOOK_SECRET = buildWebhookSecret(process.env.WHOP_WEBHOOK_SECRET);

// POST /api/payment/checkout
exports.createCheckout = async (req, res) => {
  try {
    const client = new Whop({ apiKey: WHOP_API_KEY });

    const session = await client.checkoutConfigurations.create({
      planId: WHOP_PLAN_ID,
      metadata: { userId: req.user._id.toString() },
      redirectUrl: `${FRONTEND_URL}/ai_tutor?payment=success`,
    });

    console.log("Whop checkout session response:", JSON.stringify(session));

    // purchase_url confirmed from your real log output
    const checkoutUrl = session.purchase_url;
    if (!checkoutUrl) {
      console.error("No purchase_url in Whop response:", session);
      return res.status(502).json({ message: "Checkout session created but no URL returned" });
    }

    res.json({ checkoutUrl });
  } catch (err) {
    console.error("Whop checkout creation failed:", err?.message || err);
    return res.status(502).json({ message: "Failed to create checkout session" });
  }
};

// GET /api/payment/credits
exports.getCredits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("courseCredits freeTrialUsed");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      courseCredits: user.courseCredits ?? 0,
      freeTrialUsed: !!user.freeTrialUsed,
      canGenerate: !user.freeTrialUsed || (user.courseCredits ?? 0) > 0,
    });
  } catch (err) {
    console.error("getCredits error:", err);
    res.status(500).json({ message: "Failed to fetch credits" });
  }
};

// POST /api/payment/webhook/whop
exports.whopWebhookHandler = async (req, res) => {
  // Always respond 200 quickly so Whop doesn't retry unnecessarily.
  // We do the real work after sending the response.
  res.status(200).send("OK");

  try {
    const client = new Whop({
      apiKey: WHOP_API_KEY,
      webhookSecret: WHOP_WEBHOOK_SECRET,
    });

    const rawBody = req.body.toString("utf8");
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
    );

    let webhookData;
    try {
      webhookData = client.webhooks.unwrap(rawBody, { headers });
    } catch (sigErr) {
      console.error("Whop webhook signature verification failed:", sigErr.message);
      return;
    }

    const eventType = webhookData.action || webhookData.type || "";
    console.log("Whop webhook received — event:", eventType, JSON.stringify(webhookData.data));

    const PAYMENT_EVENTS = [
      "payment.succeeded",
      "invoice_paid",
      "membership_activated",
      "membership.created",
      "payment.completed",
    ];

    if (!PAYMENT_EVENTS.includes(eventType)) {
      console.log("Whop webhook: ignoring event type:", eventType);
      return;
    }

    const payload = webhookData.data;
    const userId = payload?.metadata?.userId;

    if (!userId) {
      console.warn("Whop webhook: no userId in metadata, cannot credit:", JSON.stringify(payload));
      return;
    }

    // Idempotency check — skip if we already processed this payment
    const paymentId = payload?.id;
    if (paymentId) {
      const alreadyProcessed = await User.findOne({ processedWebhooks: paymentId });
      if (alreadyProcessed) {
        console.log("Whop webhook: already processed payment", paymentId, "— skipping");
        return;
      }
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
      console.error("Whop webhook: user not found in DB:", userId);
      return;
    }

    console.log(
      `Whop webhook: credited 1 course credit to user ${userId} (payment ${paymentId}). New balance: ${updated.courseCredits}`
    );
  } catch (err) {
    console.error("whopWebhookHandler error:", err);
  }
};