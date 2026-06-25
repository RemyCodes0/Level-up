// services/emailService.js
//
// Resend-based email sender. This is a DROP-IN replacement for the old
// nodemailer/Gmail version: it exports the same `sendEmail({ to, subject,
// text, html })` function with the same signature, so every existing caller
// (feedback controller, auth verification, etc.) keeps working with no
// changes needed on their side.
//
// Setup required:
//   1. npm install resend
//   2. In your .env:
//        RESEND_API_KEY=re_xxxxxxxxxxxx
//        RESEND_FROM_EMAIL="Level Up <noreply@leveluppedu.app>"
//      IMPORTANT about RESEND_FROM_EMAIL:
//        - The domain in the "from" address must be a domain you've VERIFIED
//          in your Resend dashboard. You cannot send from gmail.com or any
//          domain you don't control.
//        - Until you verify your own domain, Resend lets you send ONLY from
//          "onboarding@resend.dev" and ONLY to the email address you signed
//          up with — fine for testing, but you must verify a real domain
//          before sending to actual users.

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// Falls back to Resend's test sender if EMAIL_FROM isn't set yet, so things
// don't crash during setup — but set EMAIL_FROM to your verified domain for
// production.
const FROM = process.env.RESEND_FROM_EMAIL || "Level Up <onboarding@resend.dev>";

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text,
      html,
    });

    // Resend returns errors in the response object rather than throwing,
    // so we check for it explicitly.
    if (error) {
      console.error("Error sending email (Resend):", error);
      return;
    }

    console.log("Email sent:", data?.id);
  } catch (err) {
    // Network-level or unexpected failures still throw.
    console.error("Error sending email:", err);
  }
};

module.exports = sendEmail;