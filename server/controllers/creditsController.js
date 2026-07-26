// controllers/creditsController.js
//
// The credits dashboard's transaction history — a pure ledger read, kept
// separate from notchpayController.js's /credits balance endpoint (already
// the established home for balance reads) and from the checkout controllers.

const CreditTransaction = require("../models/CreditTransaction");

const PAGE_SIZE = 20;

// GET /api/payment/transactions?before=<ISO date>
// Newest first, cursor-paginated on createdAt (simpler than skip/limit for a
// list that only ever grows) — pass the createdAt of the last item seen as
// `before` to fetch the next page.
async function getTransactions(req, res) {
  try {
    const { before } = req.query;
    const query = { userId: req.user._id };
    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) query.createdAt = { $lt: beforeDate };
    }

    const rows = await CreditTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    res.json({
      transactions: page,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    console.error("[credits] getTransactions error:", err.message);
    res.status(500).json({ error: "Failed to load transaction history" });
  }
}

module.exports = { getTransactions };
