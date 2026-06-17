const crypto = require("crypto");
const User = require("../models/User");

const DODO_API_KEY = process.env.DODO_API_KEY;
const DODO_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET;
const DODO_PRODUCT_ID = process.env.DODO_PRODUCT_ID;
const CLIENT_URL = process.env.CLIENT_URL || "https://levelup-snowy.vercel.app";

// ── Fetch with timeout + retry (handles transient ETIMEDOUT/network blips) ──
async function fetchWithRetry(url, options, { timeoutMs = 25000, maxRetries = 4 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const isTimeout = err.name === "AbortError" || err.cause?.code === "ETIMEDOUT" || err.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
      console.error(`[checkout] attempt ${attempt}/${maxRetries} failed (${isTimeout ? "timeout" : err.message})`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 1500)); // 1.5s, 3s, 4.5s backoff
      }
    }
  }
  throw lastErr;
}

// ── Create a Dodo checkout session ───────────────────────────────────────────
async function createCheckout(req, res) {
  try {
    const user = req.user;
    const quantity = Math.min(Math.max(parseInt(req.body.quantity) || 1, 1), 10); // clamp 1-10

    const response = await fetchWithRetry("https://test.dodopayments.com/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DODO_API_KEY}`,
      },
      body: JSON.stringify({
        billing: {
          city: "N/A",
          country: "US",
          state: "N/A",
          street: "N/A",
          zipcode: "00000",
        },
        customer: {
          email: user.email,
          name: user.name,
          create_new_customer: false,
        },
        product_cart: [
          {
            product_id: DODO_PRODUCT_ID,
            quantity,
          },
        ],
        metadata: {
          userId: user._id.toString(),
          quantity: quantity.toString(),
        },
        payment_link: true,
        return_url: `${CLIENT_URL}/ai_tutor?payment=success`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Dodo checkout error:", data);
      return res.status(500).json({ error: "Failed to create checkout" });
    }

    res.json({ checkoutUrl: data.payment_link });
  } catch (err) {
    console.error("createCheckout error:", err);
    const isTimeout = err.name === "AbortError" || err.cause?.code === "ETIMEDOUT" || err.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "checkout_timeout" : "checkout_failed",
      message: isTimeout
        ? "Payment provider took too long to respond. Please try again in a moment."
        : "Failed to create checkout",
    });
  }
}

// ── Verify Dodo webhook signature ─────────────────────────────────────────────
function verifyWebhookSignature(payload, headers) {
  const webhookId = headers["webhook-id"];
  const webhookTimestamp = headers["webhook-timestamp"];
  const webhookSignature = headers["webhook-signature"];

  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
  const secretBytes = Buffer.from(DODO_WEBHOOK_SECRET.replace("whsec_", ""), "base64");
  const hmac = crypto.createHmac("sha256", secretBytes);
  const computedSignature = hmac.update(signedContent).digest("base64");

  const signatures = webhookSignature.split(" ");
  return signatures.some((sig) => {
    const sigValue = sig.split(",")[1];
    return sigValue === computedSignature;
  });
}

// ── Handle Dodo webhook ───────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  const rawBody = req.rawBody;

  if (!verifyWebhookSignature(rawBody, req.headers)) {
    console.warn("[webhook] Invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  console.log("[webhook] Event received:", event.type);

  if (event.type === "payment.succeeded") {
    const userId = event.data?.metadata?.userId;
    const quantity = parseInt(event.data?.metadata?.quantity) || 1;

    if (!userId) {
      console.warn("[webhook] No userId in metadata");
      return res.status(200).json({ received: true });
    }

    try {
      await User.findByIdAndUpdate(userId, {
        $inc: { courseCredits: quantity },
      });
      console.log(`[webhook] Added ${quantity} credit(s) to user ${userId}`);
    } catch (err) {
      console.error("[webhook] Failed to add credits:", err);
    }
  }

  res.status(200).json({ received: true });
}

// ── Get current user's credit balance ────────────────────────────────────────
async function getCredits(req, res) {
  try {
    const user = await User.findById(req.user._id).select("courseCredits freeTrialUsed");
    res.json({
      courseCredits: user.courseCredits,
      freeTrialUsed: user.freeTrialUsed,
      canGenerate: !user.freeTrialUsed || user.courseCredits > 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get credits" });
  }
}

module.exports = { createCheckout, handleWebhook, getCredits };