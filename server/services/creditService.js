// The ONLY place that mutates User.courseCredits/signupBonusCredits — every
// other controller should call spendCredits/grantCredits instead of writing
// those fields directly, so every mutation is guaranteed to (a) be race-safe
// and (b) leave a CreditTransaction ledger row behind.
//
// Balance model: a user's spendable balance is TWO buckets —
//   - signupBonusCredits: the one-time 100-credit signup bonus, expiring
//     signupBonusExpiresAt 30 days after signup.
//   - courseCredits: everything else (referral rewards, Stripe purchases) —
//     never expires. Kept under its existing name (this field already
//     existed before this feature) rather than renamed, to avoid touching
//     every existing call site that already reads/writes it.
// A spend always draws from the expiring bonus FIRST, so it isn't wasted by
// expiring unused while non-expiring credits sit untouched.

const User = require("../models/User");
const CreditTransaction = require("../models/CreditTransaction");

const SIGNUP_BONUS_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

class InsufficientCreditsError extends Error {
  constructor(message = "Not enough credits") {
    super(message);
    this.name = "InsufficientCreditsError";
    this.code = "insufficient_credits";
  }
}

// Pure — no DB access. An expired bonus is treated as 0 here without ever
// needing a separate write to physically zero it out; every consumer
// (this function, spendCredits' own atomic guard below, the dashboard)
// applies the identical expiry check, so nothing ever needs to agree with a
// stale "already zeroed" write.
function getSpendableBalance(user) {
  const bonusValid = !!user.signupBonusExpiresAt && new Date(user.signupBonusExpiresAt).getTime() > Date.now();
  const effectiveBonus = bonusValid ? user.signupBonusCredits || 0 : 0;
  return effectiveBonus + (user.courseCredits || 0);
}

// Atomically spends `amount` credits from userId's combined balance, bonus
// first. Throws InsufficientCreditsError if the balance is too low — the
// guard is a MongoDB $expr filter evaluated against the LIVE document at
// update time (not the stale read used to decide the bonus/course split
// below), so a concurrent spend/grant in between can only ever cause this to
// reject and need a retry — it can never let a balance go negative.
async function spendCredits(userId, amount, source, meta = {}) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("spendCredits: amount must be a positive number");
  }

  const now = new Date();
  const user = await User.findById(userId).select("signupBonusCredits signupBonusExpiresAt courseCredits");
  if (!user) throw new Error("User not found");

  const bonusValid = !!user.signupBonusExpiresAt && user.signupBonusExpiresAt > now;
  const effectiveBonus = bonusValid ? user.signupBonusCredits || 0 : 0;
  const bonusSpend = Math.min(effectiveBonus, amount);
  const courseSpend = amount - bonusSpend;

  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $gte: [
          {
            $add: [
              {
                $cond: [
                  { $and: [{ $ne: ["$signupBonusExpiresAt", null] }, { $gt: ["$signupBonusExpiresAt", now] }] },
                  "$signupBonusCredits",
                  0,
                ],
              },
              "$courseCredits",
            ],
          },
          amount,
        ],
      },
    },
    { $inc: { signupBonusCredits: -bonusSpend, courseCredits: -courseSpend } },
    { new: true }
  );

  if (!updated) {
    throw new InsufficientCreditsError();
  }

  const balanceAfter = getSpendableBalance(updated);
  await CreditTransaction.create({ userId, amount: -amount, balanceAfter, source, meta });
  return updated;
}

// Grants `amount` credits to userId. "signup_bonus" lands in the expiring
// bucket (and (re)sets the 30-day expiry); every other source is a
// non-expiring grant into courseCredits.
async function grantCredits(userId, amount, source, meta = {}) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("grantCredits: amount must be a positive number");
  }

  const update =
    source === "signup_bonus"
      ? {
          $inc: { signupBonusCredits: amount },
          $set: { signupBonusExpiresAt: new Date(Date.now() + SIGNUP_BONUS_EXPIRY_MS) },
        }
      : { $inc: { courseCredits: amount } };

  const updated = await User.findByIdAndUpdate(userId, update, { new: true });
  if (!updated) throw new Error("User not found");

  const balanceAfter = getSpendableBalance(updated);
  await CreditTransaction.create({ userId, amount, balanceAfter, source, meta });
  return updated;
}

module.exports = {
  InsufficientCreditsError,
  getSpendableBalance,
  spendCredits,
  grantCredits,
};
