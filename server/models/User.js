const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  // Only required for local (email/password) accounts — a Google account
  // has no password at all, authProvider distinguishes the two. Enforced
  // here (not just in the controller) so a stray direct-DB write or a
  // future code path can't accidentally create a passwordless local
  // account.
  password: {
    type: String,
    required: function () { return this.authProvider !== 'google'; },
  },
  // 'google' accounts are created/authenticated via Google Sign-In
  // (authController.googleAuth) — no password, googleId is Google's own
  // stable per-account subject id ("sub" claim), unique per Google account,
  // used to look the user up on subsequent logins instead of matching a
  // password.
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleId: { type: String, unique: true, sparse: true, default: null },
  verified: { type: Boolean, default: false },
  verificationToken: { type: String, default: null },
  verificationTokenExpires: { type: Date, default: null },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  referralCode:          { type: String, unique: true, sparse: true },
  referredBy:            { type: String, default: null },
  referralRewardGranted: { type: Boolean, default: false },
  referralCount:         { type: Number, default: 0 },
  referralCreditsEarned: { type: Number, default: 0 },
  // One-time 20-credit reward for submitting the feedback form — see
  // feedbackController.js's createFeedback. Same race-safe "set before
  // granting" pattern as referralRewardGranted above.
  feedbackCreditGranted: { type: Boolean, default: false },

  // ── AI Course Credits ──────────────────────────────────────────────────────
  courseCredits: { type: Number, default: 0 },      // non-expiring credits (referral, purchase)
  freeTrialUsed: { type: Boolean, default: false },  // has used the 1 free course
  // The one-time 100-credit signup bonus — expiring, tracked separately from
  // courseCredits so it can be spent first and lapse independently. See
  // creditService.js for the combined-balance/spend-order logic.
  signupBonusCredits: { type: Number, default: 0 },
  signupBonusExpiresAt: { type: Date, default: null },
  // Stripe webhook idempotency — a redelivered checkout.session.completed
  // event must never grant credits twice.
  processedStripeEvents: { type: [String], default: [] },
  // Tap Payments webhook idempotency, same reasoning as processedStripeEvents
  // above — keyed by the Tap charge id (Tap has no separate event id).
  processedTapEvents: { type: [String], default: [] },

  // ── Email preferences ──────────────────────────────────────────────────────
  // When true, this user is excluded from broadcast/marketing emails. Set via
  // the one-click unsubscribe link appended to every broadcast. Transactional
  // emails (verification, referral) ignore this flag.
  emailUnsubscribed: { type: Boolean, default: false },
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);