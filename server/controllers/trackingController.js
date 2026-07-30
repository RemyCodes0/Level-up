// controllers/trackingController.js
//
// First-party page-view logging — fired from the frontend on every route
// change (see src/Analytics.tsx). Public endpoint: a visitor doesn't need to
// be logged in for their page view to count, so this never requires a valid
// token — it only ATTACHES userId when one happens to be present and valid.
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PageView = require("../models/PageView");

const MAX_FIELD_LEN = 500; // generous for any real path/referrer, caps abuse payloads

function truncate(value, max = MAX_FIELD_LEN) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

// Best-effort: if a valid Bearer token is present, resolve it to a userId.
// Never throws and never blocks the request — an expired/missing/garbage
// token just means this page view gets logged as anonymous, exactly like a
// logged-out visitor.
async function resolveOptionalUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id").lean();
    return user?._id || null;
  } catch {
    return null;
  }
}

// POST /api/track/pageview
// Body: { path: string, referrer?: string, sessionId: string }
exports.logPageView = async (req, res) => {
  try {
    const { path, referrer, sessionId } = req.body || {};
    if (!path || typeof path !== "string" || !sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "path and sessionId are required" });
    }

    const userId = await resolveOptionalUserId(req);

    await PageView.create({
      path: truncate(path),
      referrer: truncate(referrer),
      sessionId: truncate(sessionId, 100),
      userId,
      userAgent: truncate(req.headers["user-agent"]),
    });

    res.status(204).end();
  } catch (err) {
    // A tracking failure must never surface as a visible error to a real
    // visitor — log server-side and respond 204 either way.
    console.warn("[tracking] logPageView failed (non-fatal):", err.message);
    res.status(204).end();
  }
};
