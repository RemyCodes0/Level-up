// controllers/referralController.js
//
// Referral system — every VERIFIED referral earns the referrer (only) 50
// credits. "Verified" means: the referred user signed up via the referral
// link AND verified their email. Email verification is the anti-abuse gate —
// it proves the referred user owns a real inbox — without forcing them to
// generate a lesson first (that extra step added friction and hurt signup
// conversion). The referred user themselves gets no bonus from the referral
// itself (they still get the normal 100-credit signup bonus everyone gets).
//
// Previously this was a "3 referrals = 1 credit" cycle — replaced with a
// flat per-referral reward, no cap, no cycle to reset.

const crypto = require("crypto");
const User = require("../models/User");
const sendEmail = require("../services/emailService");
const { grantCredits } = require("../services/creditService");

const REFERRAL_CREDIT_REWARD = 50;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tuyishimechristophe84@gmail.com";
const CLIENT_URL = process.env.CLIENT_URL || "https://leveluppedu.app";

// ── GET /api/referral/link ────────────────────────────────────────────────────
// Returns (or generates) the user's unique referral code and shareable link,
// plus their current referral progress.
async function getReferralLink(req, res) {
  try {
    let user = await User.findById(req.user._id).select(
      "referralCode referralCount name email"
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    // Generate a referral code the first time this is called
    if (!user.referralCode) {
      user.referralCode = crypto.randomBytes(6).toString("hex");
      await user.save();
    }

    const link = `${CLIENT_URL}/signup?ref=${user.referralCode}`;
    const totalReferrals = user.referralCount || 0;
    // Derived, not read from user.referralCreditsEarned: that field is a
    // separately-incremented counter (completeReferral bumps it alongside
    // referralCount, but in a second, independent update) and predates the
    // current flat-reward scheme, so on any account with legacy/pre-scheme
    // data it can silently drift from the truth — confirmed live on the
    // admin account: referralCount 3 / referralCreditsEarned 1, with ZERO
    // matching rows in the CreditTransaction ledger (the actual record of
    // credits ever granted). Deriving it here instead guarantees the number
    // shown always equals exactly what today's reward rule promises —
    // verified friends × the reward — with no way for it to disagree with
    // "X credits per referral" elsewhere on the same card, for this account
    // or any other, past or future.
    const creditsEarned = totalReferrals * REFERRAL_CREDIT_REWARD;

    res.json({
      code: user.referralCode,
      link,
      totalReferrals,
      creditsEarned,
      creditsPerReferral: REFERRAL_CREDIT_REWARD,
    });
  } catch (err) {
    console.error("[referral] getReferralLink error:", err);
    res.status(500).json({ error: "Failed to get referral link" });
  }
}

// ── completeReferral(referredUserId) ─────────────────────────────────────────
// Called from authController.verifyEmail when a referred user verifies their
// email. Checks if they signed up via a referral code and, if so, credits the
// referrer. Awarding on verification (not lesson generation) removes signup
// friction while still gating on a real, owned email address.
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
      "referralCount referralCreditsEarned name email"
    );
    if (!referrer) return;

    const newCount = (referrer.referralCount || 0) + 1;
    const newCreditsEarned = (referrer.referralCreditsEarned || 0) + REFERRAL_CREDIT_REWARD;

    // grantCredits both applies the $inc and writes the CreditTransaction
    // ledger row — referralCount/referralCreditsEarned below are just this
    // controller's own display counters, not the balance itself.
    await grantCredits(referrer._id, REFERRAL_CREDIT_REWARD, "referral", {
      referredUserId,
      referredEmail: referredUser.email,
    });
    await User.findByIdAndUpdate(referrer._id, {
      referralCount: newCount,
      referralCreditsEarned: newCreditsEarned,
    });

    console.log(
      `[referral] ${referredUser.email} completed referral for ${referrer.email}. ` +
      `New count: ${newCount}. Awarded ${REFERRAL_CREDIT_REWARD} credits.`
    );

    sendEmail({
      to: referrer.email,
      subject: `You earned ${REFERRAL_CREDIT_REWARD} credits on Level Up!`,
      text: [
        `Hi ${referrer.name || "there"},`,
        ``,
        `One of your referrals just signed up and verified their email!`,
        `We've added ${REFERRAL_CREDIT_REWARD} credits to your account.`,
        ``,
        `Keep sharing your link to earn more — every verified referral earns another ${REFERRAL_CREDIT_REWARD} credits, no limit:`,
        `${CLIENT_URL}/signup?ref=${referredUser.referredBy}`,
        ``,
        `— Level Up`,
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #15131F; color: #F6F1E7; border-radius: 12px;">
          <img src="${CLIENT_URL}/logo.png" alt="Level Up" style="width: 40px; height: 40px; border-radius: 8px; margin-bottom: 16px;" />
          <h2 style="color: #FF5C49; margin: 0 0 12px;">You earned ${REFERRAL_CREDIT_REWARD} credits! 🎉</h2>
          <p style="color: #9A95AC; margin: 0 0 16px;">
            One of your referrals just signed up and verified their email.
            We've added <strong style="color: #F6F1E7;">${REFERRAL_CREDIT_REWARD} credits</strong> to your account.
          </p>
          <p style="color: #9A95AC; margin: 0 0 20px;">
            Keep sharing to earn more — every verified referral earns ${REFERRAL_CREDIT_REWARD} credits, with no limit.
          </p>
          <a href="${CLIENT_URL}/signup?ref=${referredUser.referredBy}"
            style="display: inline-block; background: #FF5C49; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Share your link
          </a>
        </div>
      `,
    }).catch((err) => console.error("[referral] Failed to send credit email:", err.message));

    sendEmail({
      to: ADMIN_EMAIL,
      subject: `Referral credit awarded — ${referrer.email}`,
      text: `${referrer.email} earned ${REFERRAL_CREDIT_REWARD} referral credits. Total referrals: ${newCount}. Total credits from referrals: ${newCreditsEarned}.`,
    }).catch(() => {});
  } catch (err) {
    console.error("[referral] completeReferral error:", err);
  }
}

module.exports = { getReferralLink, completeReferral };