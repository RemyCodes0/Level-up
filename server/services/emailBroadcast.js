const crypto = require("crypto");
const sendEmail = require("./emailService");

// ─────────────────────────────────────────────────────────────────────────────
// Email broadcast service
//
// Sending to "a lot of users (or all)" has three hazards this handles:
//   1. It must NOT block the HTTP request — a few thousand sends can take
//      minutes. So a broadcast returns a jobId immediately and processes in the
//      background; the frontend polls job progress.
//   2. It must be RATE-LIMITED — firing thousands of requests at Resend at once
//      gets you throttled or blocked. We send in small concurrent batches with a
//      delay between them.
//   3. It must be LEGAL / deliverable — every broadcast gets a one-click
//      unsubscribe link, and unsubscribed users are excluded before sending.
//
// Jobs are tracked IN MEMORY. That's fine for a single-instance server, but note:
// if the server restarts mid-broadcast, in-flight job progress is lost (already
// sent emails are NOT re-sent because we advance through the list; a restart just
// stops the remainder). For a small app this is an acceptable trade for zero
// infra. Move to a real queue (BullMQ/Redis) if you scale to multiple instances.
// ─────────────────────────────────────────────────────────────────────────────

// Tuning: how many emails to send at once, and how long to pause between batches.
// Conservative defaults that stay well under typical Resend rate limits. Adjust
// via env if your plan allows more throughput.
const BATCH_SIZE = Number(process.env.EMAIL_BATCH_SIZE) || 5;
const BATCH_DELAY_MS = Number(process.env.EMAIL_BATCH_DELAY_MS) || 1200;

const jobs = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Stateless, signed unsubscribe token: HMAC(userId) with the app secret. No DB
// storage needed, and it can't be forged. Verified in the unsubscribe route.
function makeUnsubscribeToken(userId) {
  const secret = process.env.JWT_SECRET || "unsubscribe-secret-fallback";
  const sig = crypto.createHmac("sha256", secret).update(String(userId)).digest("hex").slice(0, 32);
  return `${userId}.${sig}`;
}

function verifyUnsubscribeToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [userId, sig] = token.split(".");
  const expected = makeUnsubscribeToken(userId).split(".")[1];
  // Constant-time compare to avoid timing attacks.
  const ok =
    sig &&
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok ? userId : null;
}

// Append a footer with the unsubscribe link to each recipient's email. The link
// is per-user (contains their signed token), so it must be built per recipient.
function withUnsubscribeFooter({ html, text }, unsubscribeUrl) {
  const htmlFooter = `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;font-family:sans-serif;">
      You're receiving this because you have a Level Up account.
      <a href="${unsubscribeUrl}" style="color:#6366f1;">Unsubscribe</a>.
    </div>`;
  const textFooter = `\n\n—\nYou're receiving this because you have a Level Up account. Unsubscribe: ${unsubscribeUrl}`;
  return {
    html: (html || "") + htmlFooter,
    text: (text || "") + textFooter,
  };
}

// Starts a background broadcast. `recipients` is an array of { _id, email, name }.
// Returns a jobId immediately; progress is readable via getJob(jobId).
function startBroadcast({ recipients, subject, html, text }) {
  const jobId = crypto.randomBytes(8).toString("hex");
  const job = {
    id: jobId,
    total: recipients.length,
    sent: 0,
    failed: 0,
    status: "running", // running | done | error
    startedAt: Date.now(),
    finishedAt: null,
    errors: [], // sample of failures (capped)
  };
  jobs.set(jobId, job);

  // Fire-and-forget — do NOT await. The route returns jobId right away.
  (async () => {
    const appUrl = (process.env.APP_URL || "https://leveluppedu.app").replace(/\/$/, "");
    try {
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (u) => {
            try {
              const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(
                makeUnsubscribeToken(u._id)
              )}`;
              const body = withUnsubscribeFooter({ html, text }, unsubscribeUrl);
              // Personalize a {{name}} placeholder if present.
              const personalizedHtml = body.html.replace(/\{\{\s*name\s*\}\}/g, u.name || "there");
              const personalizedText = body.text.replace(/\{\{\s*name\s*\}\}/g, u.name || "there");
              await sendEmail({
                to: u.email,
                subject,
                html: personalizedHtml,
                text: personalizedText,
              });
              job.sent++;
            } catch (err) {
              job.failed++;
              if (job.errors.length < 20) job.errors.push({ email: u.email, error: err.message });
            }
          })
        );
        if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
      }
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.errors.push({ email: "(job)", error: err.message });
    } finally {
      job.finishedAt = Date.now();
    }
  })();

  return jobId;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

module.exports = {
  startBroadcast,
  getJob,
  makeUnsubscribeToken,
  verifyUnsubscribeToken,
};