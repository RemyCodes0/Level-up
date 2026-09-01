// routes/adminEmail.js
// Admin-only email tools: send an individual email, or broadcast to a segment.
// Mounted at /api/admin/email — every route requires admin auth (see app.js).
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/requireAdmin");
const User = require("../models/User");
const sendEmail = require("../services/emailService");
const { startBroadcast, getJob } = require("../services/emailBroadcast");

router.use(protect, requireAdmin);

// Build the Mongo filter for a broadcast audience. Every account is a
// learner now (the peer-tutoring role distinction is gone — see User.js),
// so there's nothing left to segment by beyond the unsubscribe flag.
function audienceFilter() {
  return { emailUnsubscribed: { $ne: true }, email: { $exists: true, $ne: "" } };
}

// GET /api/admin/email/recipients — counts for the UI ("send to N people").
router.get("/recipients", async (req, res) => {
  try {
    const [all, unsubscribed] = await Promise.all([
      User.countDocuments(audienceFilter()),
      User.countDocuments({ emailUnsubscribed: true }),
    ]);
    res.json({ all, unsubscribed });
  } catch (err) {
    console.error("email/recipients error:", err);
    res.status(500).json({ error: "Failed to count recipients" });
  }
});

// POST /api/admin/email/send
// Body:
//   { mode: "individual", to, subject, html, text }
//   { mode: "test", subject, html, text }                        → sends only to the admin
//   { mode: "broadcast", subject, html, text }                    → sends to every subscribed user
// Returns { jobId } for broadcasts (poll /job/:id), or { ok: true } for single sends.
router.post("/send", async (req, res) => {
  const { mode, to, subject, html, text } = req.body || {};

  if (!subject || !String(subject).trim()) {
    return res.status(400).json({ error: "Subject is required" });
  }
  if (!html && !text) {
    return res.status(400).json({ error: "Email body is required" });
  }

  try {
    // Single send (individual or a test to yourself).
    if (mode === "individual" || mode === "test") {
      const recipient = mode === "test" ? req.user.email : to;
      if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
        return res.status(400).json({ error: "A valid recipient email is required" });
      }
      await sendEmail({ to: recipient, subject, html, text });
      return res.json({ ok: true, sentTo: recipient });
    }

    // Broadcast to every subscribed user.
    if (mode === "broadcast") {
      // Pull only what we need to send (id, email, name), lean for memory.
      const recipients = await User.find(audienceFilter())
        .select("_id email name")
        .lean();

      if (recipients.length === 0) {
        return res.status(400).json({ error: "No recipients match that audience" });
      }

      const jobId = startBroadcast({ recipients, subject, html, text });
      return res.json({ ok: true, jobId, total: recipients.length });
    }

    return res.status(400).json({ error: "mode must be individual, test, or broadcast" });
  } catch (err) {
    console.error("email/send error:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// GET /api/admin/email/job/:id — broadcast progress (polled by the UI).
router.get("/job/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found (it may have expired on a server restart)" });
  res.json(job);
});

module.exports = router;