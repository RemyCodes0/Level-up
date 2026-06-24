// routes/payment.routes.js

const express = require("express");
const {
  whopWebhookHandler,
  createCheckout,
  getCredits,
} = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC MIDDLEWARE — logs everything about the incoming webhook request
// BEFORE express.raw() touches it, so we can see exactly what arrives.
// Remove once everything is confirmed working.
// ──────────────────────────────────────────────────────────────────────────
router.use("/webhook/whop", (req, res, next) => {
  console.log("──────── INCOMING WEBHOOK REQUEST ────────");
  console.log("[webhook] Method:", req.method);
  console.log("[webhook] Content-Type header:", req.headers["content-type"]);
  console.log("[webhook] Content-Length header:", req.headers["content-length"]);
  console.log("[webhook] req.body type BEFORE raw parser:", typeof req.body, req.body);
  next();
});

// Webhook must receive the RAW, unmodified body for Whop's Standard
// Webhooks signature verification to succeed. This express.raw() call
// MUST run before any global express.json()/urlencoded() middleware
// touches this path, or the body will already be consumed/parsed and
// signature verification will fail with "No matching signature found".
//
// type: "*/*" is intentional — Whop does not reliably send
// "application/json" as the Content-Type on every webhook delivery, and
// if the type doesn't match, express.raw() will skip parsing and req.body
// will be an empty object instead of a Buffer.
router.post(
  "/webhook/whop",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    // Second diagnostic checkpoint — confirm express.raw() actually
    // produced a Buffer and didn't get skipped.
    console.log("[webhook] req.body type AFTER raw parser:", typeof req.body);
    console.log("[webhook] req.body is Buffer:", Buffer.isBuffer(req.body));
    console.log("[webhook] req.body byteLength:", req.body?.length);
    next();
  },
  whopWebhookHandler
);

// Authenticated routes
router.post("/checkout", protect, createCheckout);
router.get("/credits", protect, getCredits);

module.exports = router;