const mongoose = require("mongoose");

// Every credit mutation this feature makes (signup bonus, referral, a Stripe
// purchase, spending on course generation, a refund) writes exactly one of
// these — the ledger creditService.js reads from for the credits dashboard,
// and the only place "why did this user's balance change" can be answered
// from after the fact.
const CREDIT_SOURCES = ["signup_bonus", "referral", "purchase", "course_generation", "refund"];

const creditTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Signed: positive = credit granted, negative = credit spent.
    amount: { type: Number, required: true },
    // Combined spendable balance (signup bonus, if unexpired, + non-expiring
    // credits) immediately AFTER this transaction — a point-in-time snapshot
    // so the dashboard's transaction list doesn't need to replay the whole
    // ledger to show a running balance.
    balanceAfter: { type: Number, required: true },
    source: { type: String, enum: CREDIT_SOURCES, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Dashboard's transaction list: filter by user, newest first.
creditTransactionSchema.index({ userId: 1, createdAt: -1 });

const CreditTransaction = mongoose.model("CreditTransaction", creditTransactionSchema);
CreditTransaction.CREDIT_SOURCES = CREDIT_SOURCES;

module.exports = CreditTransaction;
