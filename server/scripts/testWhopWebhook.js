// Sends a correctly SIGNED fake `payment.succeeded` event to the Whop webhook,
// to test it locally or on production without making a real payment.
//
//   node scripts/testWhopWebhook.js <userId|email> [--prod] [--url <base>]
//        [--payment-id <id>] [--bad-signature] [--other-plan]
//
//   (default target)  http://localhost:<PORT>     — your local server
//   --prod            SERVER_URL from .env        — the live Render backend
//   --payment-id      reuse an id to test idempotency (2nd send => "duplicate")
//   --bad-signature   must be rejected with 400
//   --other-plan      must be ignored (wrong plan id)
//
// WARNING: this really grants credits (the user's DB is shared between local
// and production). Use your own account.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const mongoose = require("mongoose");
const { Webhook } = require("standardwebhooks");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const target = args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--url", "--payment-id"].includes(args[i - 1])));

(async () => {
  if (!target) { console.error("Usage: node scripts/testWhopWebhook.js <userId|email> [--prod] [--url <base>] ..."); process.exit(1); }
  const secret = process.env.webhook_secret || process.env.WHOP_WEBHOOK_SECRET;
  const planId = process.env.PRODUCT_PLAN || process.env.WHOP_PLAN_ID;
  if (!secret || !planId) { console.error("webhook_secret / PRODUCT_PLAN missing in .env"); process.exit(1); }

  let userId = target;
  if (target.includes("@")) {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const u = await mongoose.model("User", new mongoose.Schema({}, { strict: false, collection: "users" })).findOne({ email: target.toLowerCase() }).select("_id");
    await mongoose.disconnect();
    if (!u) { console.error(`No user with email ${target}`); process.exit(1); }
    userId = u._id.toString();
  }

  const base = opt("--url") || (flag("--prod") ? (process.env.SERVER_URL || "").split(/\s/)[0] : `http://localhost:${process.env.PORT || 5000}`);
  const url = `${base.replace(/\/$/, "")}/api/webhooks/whop`;
  const paymentId = opt("--payment-id") || `pay_test_${Date.now()}`;

  const body = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    api_version: "v1",
    type: "payment.succeeded",
    timestamp: new Date().toISOString(),
    data: { id: paymentId, status: "paid", plan: { id: flag("--other-plan") ? "plan_someOtherPlan" : planId }, metadata: { userId } },
  });

  const msgId = `msg_test_${Date.now()}`;
  const ts = new Date();
  const wh = new Webhook(Buffer.from(flag("--bad-signature") ? "wrong-secret" : secret).toString("base64"));
  const headers = {
    "Content-Type": "application/json",
    "webhook-id": msgId,
    "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
    "webhook-signature": wh.sign(msgId, ts, body),
  };

  console.log(`POST ${url}\n  user ${userId}, payment ${paymentId}`);
  const res = await fetch(url, { method: "POST", headers, body });
  console.log(`-> HTTP ${res.status} ${await res.text()}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
