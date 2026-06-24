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
  const encoded = Buffer.from(raw, "utf8").toString("base64");
  console.log("[boot] WHOP_WEBHOOK_SECRET raw value (length):", raw.length);
  console.log("[boot] WHOP_WEBHOOK_SECRET starts with:", raw.slice(0, 6));
  console.log("[boot] Encoded webhookKey (base64):", encoded);
  return encoded;
}

console.log("[boot] WHOP_API_KEY present:", !!WHOP_API_KEY);
console.log("[boot] WHOP_PLAN_ID:", WHOP_PLAN_ID);
console.log("[boot] FRONTEND_URL:", FRONTEND_URL);

const WHOP_WEBHOOK_KEY = buildWebhookKey(process.env.WHOP_WEBHOOK_SECRET);

// ──────────────────────────────────────────────────────────────────────────
// POST /api/payment/checkout
// ──────────────────────────────────────────────────────────────────────────
exports.createCheckout = async (req, res) => {
  console.log("[checkout] Request received for user:", req.user?._id?.toString());

  try {
    const client = new Whop({ apiKey: WHOP_API_KEY });

    const params = {
      planId: WHOP_PLAN_ID,
      metadata: { userId: req.user._id.toString() },
      redirectUrl: `${FRONTEND_URL}/ai_tutor?payment=success`,
    };
    console.log("[checkout] Calling checkoutConfigurations.create with:", JSON.stringify(params));

    const session = await client.checkoutConfigurations.create(params);

    console.log("[checkout] Whop checkout session response:", JSON.stringify(session));

    const checkoutUrl = session.purchase_url;
    if (!checkoutUrl) {
      console.error("[checkout] No purchase_url in Whop response:", JSON.stringify(session));
      return res.status(502).json({ message: "Checkout session created but no URL returned" });
    }

    console.log("[checkout] Returning checkoutUrl to client:", checkoutUrl);
    res.json({ checkoutUrl });
  } catch (err) {
    console.error("[checkout] Whop checkout creation failed:", err?.message || err);
    if (err?.response) {
      console.error("[checkout] Error response data:", JSON.stringify(err.response.data || err.response));
    }
    return res.status(502).json({ message: "Failed to create checkout session" });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// GET /api/payment/credits
// ──────────────────────────────────────────────────────────────────────────
exports.getCredits = async (req, res) => {
  console.log("[credits] Request received for user:", req.user?._id?.toString());

  try {
    const user = await User.findById(req.user._id).select("courseCredits freeTrialUsed");
    if (!user) {
      console.warn("[credits] User not found:", req.user._id);
      return res.status(404).json({ message: "User not found" });
    }

    const result = {
      courseCredits: user.courseCredits ?? 0,
      freeTrialUsed: !!user.freeTrialUsed,
      canGenerate: !user.freeTrialUsed || (user.courseCredits ?? 0) > 0,
    };
    console.log("[credits] Returning:", JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error("[credits] getCredits error:", err);
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
      console.error(
        "[webhook] req.body is NOT a Buffer — express.raw() did not run correctly. Typeof:",
        typeof req.body,
        "Value:",
        req.body
      );
      return;
    }

    const rawBody = req.body.toString("utf8");
    console.log("[webhook] Raw body length:", rawBody.length);
    console.log("[webhook] Raw body preview (first 300 chars):", rawBody.slice(0, 300));

    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
    );
    console.log("[webhook] webhook-id header:", headers["webhook-id"]);
    console.log("[webhook] webhook-timestamp header:", headers["webhook-timestamp"]);
    console.log("[webhook] webhook-signature header:", headers["webhook-signature"]);
    console.log("[webhook] content-type header:", headers["content-type"]);
    console.log("[webhook] Full headers object:", JSON.stringify(headers));

    let webhookData;
    try {
      webhookData = client.webhooks.unwrap(rawBody, { headers });
      console.log("[webhook] Signature verification PASSED");
    } catch (sigErr) {
      console.error("[webhook] Signature verification FAILED:", sigErr.message);
      console.error("[webhook] Full signature error:", sigErr);
      console.error(
        "[webhook] DEBUG — secret used (base64):", WHOP_WEBHOOK_KEY,
        "| webhook-id:", headers["webhook-id"],
        "| webhook-timestamp:", headers["webhook-timestamp"],
        "| webhook-signature:", headers["webhook-signature"]
      );
      return;
    }

    console.log("[webhook] Parsed webhookData:", JSON.stringify(webhookData));

    const eventType = webhookData.action || webhookData.type || "";
    console.log("[webhook] Event type:", eventType);
    console.log("[webhook] Event data:", JSON.stringify(webhookData.data));

    const PAYMENT_EVENTS = [
      "payment.succeeded",
      "invoice_paid",
      "membership_activated",
      "membership.created",
      "payment.completed",
    ];

    if (!PAYMENT_EVENTS.includes(eventType)) {
      console.log("[webhook] Ignoring event type (not in PAYMENT_EVENTS list):", eventType);
      console.log("[webhook] PAYMENT_EVENTS currently watched:", JSON.stringify(PAYMENT_EVENTS));
      return;
    }

    const payload = webhookData.data;
    const userId = payload?.metadata?.userId;
    console.log("[webhook] Extracted userId from metadata:", userId);

    if (!userId) {
      console.warn("[webhook] No userId in metadata — cannot credit. Full payload:", JSON.stringify(payload));
      return;
    }

    const paymentId = payload?.id;
    console.log("[webhook] Payment ID:", paymentId);

    if (paymentId) {
      const alreadyProcessed = await User.findOne({ processedWebhooks: paymentId });
      if (alreadyProcessed) {
        console.log("[webhook] Payment", paymentId, "already processed for user", alreadyProcessed._id, "— skipping to avoid double-credit");
        return;
      }
      console.log("[webhook] Payment", paymentId, "not yet processed — proceeding to credit");
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
      `[webhook] SUCCESS — credited 1 course credit to user ${userId} (payment ${paymentId}). New balance: ${updated.courseCredits}`
    );
  } catch (err) {
    console.error("[webhook] Unhandled error in whopWebhookHandler:", err);
  } finally {
    console.log("======== WHOP WEBHOOK HANDLER END ========");
  }
};