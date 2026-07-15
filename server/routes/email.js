// routes/email.js — PUBLIC email endpoints (no auth). Currently: unsubscribe.
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { verifyUnsubscribeToken } = require("../services/emailBroadcast");

// GET /api/email/unsubscribe?token=... — one-click unsubscribe from broadcasts.
// Public and must stay public (the recipient isn't logged in). The token is a
// signed HMAC of the user id, so it can't be forged and needs no DB lookup to
// validate. Returns a small HTML confirmation page since it's opened in a browser.
router.get("/unsubscribe", async (req, res) => {
  const userId = verifyUnsubscribeToken(req.query.token);

  const page = (title, message) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
  <div style="max-width:420px;text-align:center;padding:32px;">
    <h1 style="font-size:20px;margin-bottom:12px;">${title}</h1>
    <p style="color:#94a3b8;line-height:1.6;">${message}</p>
    <a href="${(process.env.APP_URL || "https://leveluppedu.app").replace(/\/$/, "")}"
       style="display:inline-block;margin-top:20px;color:#818cf8;">Back to Level Up</a>
  </div>
</body></html>`;

  if (!userId) {
    return res
      .status(400)
      .send(page("Invalid link", "This unsubscribe link is invalid or has expired."));
  }

  try {
    await User.findByIdAndUpdate(userId, { emailUnsubscribed: true });
    res.send(
      page(
        "You're unsubscribed",
        "You won't receive any more broadcast emails from Level Up. Account and course-related emails will still be sent."
      )
    );
  } catch (err) {
    console.error("unsubscribe error:", err);
    res.status(500).send(page("Something went wrong", "Please try again later."));
  }
});

module.exports = router;