const Feedback = require("../models/Feedback");
const sendEmail = require("../services/emailService");

const FEEDBACK_RECIPIENT = process.env.FEEDBACK_EMAIL || "tuyishimechristophe84@gmail.com";

exports.createFeedback = async (req, res) => {
  const { rating, message, courseId, courseName } = req.body;

  if (!rating || !message) {
    return res.status(400).json({ message: "Rating and message are required" });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" });
  }
  if (message.length > 2000) {
    return res.status(400).json({ message: "Message must be under 2000 characters" });
  }

  try {
    // req.user is set by the auth middleware (if logged in)
    const feedback = await Feedback.create({
      userId: req.user?._id || null,
      userName: req.user?.name || "Anonymous",
      userEmail: req.user?.email || null,
      courseId: courseId || null,
      courseName: courseName || null,
      rating,
      message,
    });

    // Send email notification (non-blocking — don't fail the request if email fails)
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    sendEmail({
      to: FEEDBACK_RECIPIENT,
      subject: `Level Up Feedback — ${stars} ${courseName || "General"}`,
      text: [
        `Rating: ${stars} (${rating}/5)`,
        `Course: ${courseName || "N/A"}`,
        `User: ${req.user?.name || "Anonymous"} (${req.user?.email || "not logged in"})`,
        ``,
        `Message:`,
        message,
        ``,
        `---`,
        `Feedback ID: ${feedback._id}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b; margin: 0 0 16px;">New Feedback Received</h2>
          <div style="background: #f8fafc; border-radius: 10px; padding: 20px; margin-bottom: 16px;">
            <p style="margin: 0 0 8px; font-size: 28px; letter-spacing: 4px;">${stars}</p>
            <p style="margin: 0; color: #64748b; font-size: 13px;">${rating} out of 5 stars</p>
          </div>
          <table style="width: 100%; font-size: 14px; color: #334155; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #94a3b8; width: 80px;">Course</td><td style="padding: 6px 0; font-weight: 600;">${courseName || "N/A"}</td></tr>
            <tr><td style="padding: 6px 0; color: #94a3b8;">User</td><td style="padding: 6px 0;">${req.user?.name || "Anonymous"} (${req.user?.email || "not logged in"})</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;">
            <p style="margin: 0; color: #1e293b; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
          </div>
          <p style="margin-top: 16px; color: #94a3b8; font-size: 11px;">Feedback ID: ${feedback._id} · ${new Date().toISOString()}</p>
        </div>
      `,
    }).catch((err) => console.error("Failed to send feedback email:", err));

    res.status(201).json({ message: "Thank you for your feedback!" });
  } catch (err) {
    console.error("createFeedback error:", err);
    res.status(500).json({ message: "Failed to submit feedback" });
  }
};