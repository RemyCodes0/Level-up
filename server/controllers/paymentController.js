// controllers/paymentController.js
//
// Whop integration. Two pieces:
//   1. createCheckout — calls Whop's REST API to create a checkout session
//      tied to our specific plan, tagging it with our internal userId via
//      metadata so the webhook knows who to credit.
//   2. whopWebhookHandler — listens for payment.succeeded, verifies the
//      webhook signature using Whop's own SDK, and adds 1 credit to the
//      right user's account.
//
// IMPORTANT — things I could not verify without live API access and that
// YOU need to confirm on your first real test:
//   - The exact field name Whop returns for the checkout URL in the
//     create-checkout-session response (I'm guessing `purchase_url` based
//     on common patterns in their docs, but log the full response on your
//     first test and adjust CHECKOUT_URL_FIELD below if it's named
//     differently, e.g. `checkout_url` or `url`).
//   - The exact path to metadata inside the payment.succeeded webhook
//     payload (I'm reading webhookData.data.metadata?.userId based on the
//     webhook examples shown in Whop's docs, but confirm this on your
//     first real test purchase).

const User = require("../models/User");

const WHOP_API_KEY = process.env.WHOP_API_KEY;
const WHOP_PLAN_ID = process.env.WHOP_PLAN_ID; // the plan_... ID for the $4.99 course credit
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Guessed field name for the checkout URL in Whop's response — VERIFY on
// your first test (see note above) and update this if needed.
const CHECKOUT_URL_FIELD = "purchase_url";

// POST /api/payment/checkout — creates a Whop checkout session for the
// current user and returns the URL to redirect them to.
exports.createCheckout = async (req, res) => {
  try {
    // Using the official @whop/sdk package instead of a hand-constructed
    // fetch URL — the previous version guessed at the exact endpoint path
    // and host, which is the more likely root cause of the 401 "no
    // permission" error (a wrong route can come back as a permission
    // error rather than a clean 404). The SDK handles routing internally,
    // removing that guesswork entirely.
    //
    // NOTE: I could not verify the exact method name on the installed SDK
    // without live package access. Based on Whop's own Pipedream
    // integration example, it's likely `createCheckoutSession` directly on
    // the client. If your editor's autocomplete shows a different method
    // name on `whopsdk` (e.g. nested under `whopsdk.checkoutSessions.create`),
    // use that instead — check your installed @whop/sdk's type definitions.
    // FIXED based on real diagnostic output: there is no "WhopServerSdk"
    // export — the package exports "Whop" (and the module itself is
    // directly callable), following the same pattern as OpenAI's SDK.
    // VERIFY the exact checkout-creation method name yourself using your
    // editor's autocomplete on `client.` — I can't confirm that part
    // without live access to the type definitions, only the constructor
    // shape, which the diagnostic output confirmed.
    const { Whop } = require("@whop/sdk");
    const client = new Whop({ apiKey: WHOP_API_KEY });

    // FIXED based on real diagnostic output: there is no createCheckoutSession
    // method or checkoutSessions resource at all. The actual resource is
    // "checkoutConfigurations", confirmed directly from the installed
    // package's prototype methods (list, create, retrieve).
    const session = await client.checkoutConfigurations.create({
      planId: WHOP_PLAN_ID,
      metadata: { userId: req.user._id.toString() },
      redirectUrl: `${FRONTEND_URL}/ai_tutor?payment=success`,
    });

    // Log the full response on your first real test — this tells us the
    // actual shape of what the SDK returns, since I can't verify it without
    // live access. Look for whatever field holds the checkout URL.
    console.log("Whop checkout session response:", JSON.stringify(session));

    const checkoutUrl = session[CHECKOUT_URL_FIELD] || session.url || session.checkout_url;
    if (!checkoutUrl) {
      console.error(
        `No checkout URL found under "${CHECKOUT_URL_FIELD}", "url", or "checkout_url" — check the logged response above for the real field name.`
      );
      return res.status(502).json({ message: "Checkout session created but no URL returned" });
    }

    res.json({ checkoutUrl });
  } catch (err) {
    console.error("Whop checkout creation failed:", err?.message || err);
    return res.status(502).json({ message: "Failed to create checkout session" });
  }
};

// GET /api/payment/credits — unchanged from before, returns the user's
// current credit/free-trial status.
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

// POST /api/payment/webhook/whop — Whop calls this when a payment event
// happens. Must receive the RAW request body (not pre-parsed JSON) for
// signature verification to work — see the express.raw() middleware note
// in payment.routes.js.
exports.whopWebhookHandler = async (req, res) => {
  try {
    // Using Whop's own SDK for signature verification rather than hand-
    // rolling it, since this is the exact pattern shown in their official
    // docs and getting webhook verification wrong is a real security risk.
    // npm install @whop/sdk
    // Same fix as createCheckout above — "WhopServerSdk" doesn't exist,
    // the real export is "Whop".
    const { Whop } = require("@whop/sdk");
    const client = new Whop({ apiKey: WHOP_API_KEY, webhookSecret: process.env.WHOP_WEBHOOK_SECRET });

    const rawBody = req.body.toString("utf8");
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
    );

    const webhookData = whopsdk.webhooks.unwrap(rawBody, { headers });

    // Log every incoming event's type/action while we're still figuring out
    // which exact event Whop fires for a completed one-time purchase —
    // check your Render logs after a real test purchase to see what shows
    // up here, then we can narrow the condition below to match it exactly.
    console.log("Whop webhook received:", webhookData.type || webhookData.action, JSON.stringify(webhookData.data));

    if (
      webhookData.type === "payment.succeeded" ||
      webhookData.action === "payment.succeeded" ||
      webhookData.type === "invoice_paid" ||
      webhookData.action === "invoice_paid" ||
      webhookData.type === "membership_activated" ||
      webhookData.action === "membership_activated"
    ) {
      const payload = webhookData.data;
      const userId = payload?.metadata?.userId;

      if (!userId) {
        console.warn("payment.succeeded webhook had no userId in metadata — cannot credit anyone:", payload);
      } else {
        await User.findByIdAndUpdate(userId, { $inc: { courseCredits: 1 } });
        console.log(`Credited 1 course credit to user ${userId} via Whop payment ${payload.id}`);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("whopWebhookHandler error:", err);
    res.status(200).send("Received");
  }
};