// controllers/referralController.js
//
// Referral system — every 3 verified referrals earns the referrer 1 free credit.
// "Verified" means: the referred user signed up via the referral link AND
// has generated at least one lesson (their free trial). This prevents fake
// account abuse since generating a lesson costs real compute time (~5 min).
//
// The cycle repeats indefinitely — 3 friends = 1 credit, then the counter
// resets. 6 friends = 2 credits, 9 = 3, and so on.

const crypto = require("crypto");
const User = require("../models/User");
const sendEmail = require("../services/emailService");

const REFERRALS_PER_CREDIT = 3;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tuyishimechristophe84@gmail.com";
const CLIENT_URL = process.env.CLIENT_URL || "https://leveluppedu.app";

// ── GET /api/referral/link ────────────────────────────────────────────────────
// Returns (or generates) the user's unique referral code and shareable link,
// plus their current referral progress.
async function getReferralLink(req, res) {
  try {
    let user = await User.findById(req.user._id).select(
      "referralCode referralCount referralCreditsEarned name email"
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    // Generate a referral code the first time this is called
    if (!user.referralCode) {
      user.referralCode = crypto.randomBytes(6).toString("hex");
      await user.save();
    }

    const link = `${CLIENT_URL}/signup?ref=${user.referralCode}`;
    const totalReferrals = user.referralCount || 0;
    // How many verified referrals into the current cycle (resets every 3)
    const progressInCycle = totalReferrals % REFERRALS_PER_CREDIT;
    const creditsEarned = user.referralCreditsEarned || 0;

    res.json({
      code: user.referralCode,
      link,
      totalReferrals,
      progressInCycle,          // 0, 1, or 2 — shown as "X/3 friends joined"
      creditsEarned,
      nextCreditAt: REFERRALS_PER_CREDIT - progressInCycle,
    });
  } catch (err) {
    console.error("[referral] getReferralLink error:", err);
    res.status(500).json({ error: "Failed to get referral link" });
  }
}

// ── POST /api/referral/complete ───────────────────────────────────────────────
// Called internally when a user generates their first lesson (the free trial).
// Checks if they signed up via a referral code and, if so, credits the referrer.
// This is called from courseController.js after lesson 1 is confirmed ready —
// NOT on account creation, to prevent fake-account abuse.
async function completeReferral(referredUserId) {
  try {
    const referredUser = await User.findById(referredUserId).select(
      "referredBy freeTrialUsed referralRewardGranted email"
    );
    if (!referredUser) return;
    // Only fires once per referred user — the second course they generate
    // doesn't re-trigger the referral reward
    if (!referredUser.referredBy) return;
    if (referredUser.referralRewardGranted) return;

    // Mark this referral as processed immediately to prevent race conditions
    // if two lessons complete nearly simultaneously
    await User.findByIdAndUpdate(referredUserId, { referralRewardGranted: true });

    const referrer = await User.findOne({ referralCode: referredUser.referredBy }).select(
      "referralCount referralCreditsEarned courseCredits name email"
    );
    if (!referrer) return;

    const newCount = (referrer.referralCount || 0) + 1;
    const newCreditsEarned = referrer.referralCreditsEarned || 0;
    const updatePayload = { referralCount: newCount };

    // Award a credit every time the count hits a multiple of REFERRALS_PER_CREDIT
    const shouldAwardCredit = newCount % REFERRALS_PER_CREDIT === 0;
    if (shouldAwardCredit) {
      updatePayload.$inc = { courseCredits: 1 };
      updatePayload.referralCreditsEarned = newCreditsEarned + 1;
    }

    await User.findByIdAndUpdate(referrer._id, updatePayload);

    console.log(
      `[referral] ${referredUser.email} completed referral for ${referrer.email}. ` +
      `New count: ${newCount}. Credit awarded: ${shouldAwardCredit}`
    );

    // Notify referrer by email if they just earned a credit
    if (shouldAwardCredit) {
      sendEmail({
        to: referrer.email,
        subject: "You earned a free course credit on Level Up!",
        text: [
          `Hi ${referrer.name || "there"},`,
          ``,
          `One of your referrals just generated their first lesson — and that was your 3rd!`,
          `We've added 1 free course credit to your account.`,
          ``,
          `Keep sharing your link to earn more:`,
          `${CLIENT_URL}/signup?ref=${referredUser.referredBy}`,
          ``,
          `— Level Up`,
        ].join("\n"),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #15131F; color: #F6F1E7; border-radius: 12px;">
            <img src="${CLIENT_URL}/logo.png" alt="Level Up" style="width: 40px; height: 40px; border-radius: 8px; margin-bottom: 16px;" />
            <h2 style="color: #FF5C49; margin: 0 0 12px;">You earned a free credit! 🎉</h2>
            <p style="color: #9A95AC; margin: 0 0 16px;">
              One of your referrals just generated their first lesson — that's 3 friends joined!
              We've added <strong style="color: #F6F1E7;">1 free course credit</strong> to your account.
            </p>
            <p style="color: #9A95AC; margin: 0 0 20px;">
              Keep sharing to earn more — every 3 friends = 1 free credit, with no limit.
            </p>
            <a href="${CLIENT_URL}/signup?ref=${referredUser.referredBy}"
              style="display: inline-block; background: #FF5C49; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Share your link
            </a>
          </div>
        `,
      }).catch((err) => console.error("[referral] Failed to send credit email:", err.message));

      // Also notify admin
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `Referral credit awarded — ${referrer.email}`,
        text: `${referrer.email} earned a referral credit. Total referrals: ${newCount}. Total credits from referrals: ${newCreditsEarned + 1}.`,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[referral] completeReferral error:", err);
  }
}

module.exports = { getReferralLink, completeReferral };