const jwt = require('jsonwebtoken')
const User = require('../models/User')

// `protect` runs on every authenticated request, so User.findById was firing
// on every single API call. This caches the (password-stripped) user doc for
// a few seconds per user id — long enough to absorb bursts of requests from
// the same user (a page load firing several API calls at once), short enough
// that role/verification changes still take effect almost immediately.
// In-memory only: fine for a single Node process; would need to move to a
// shared cache (e.g. Redis) if this ever runs as multiple processes/instances.
const USER_CACHE_TTL_MS = 15_000;
const userCache = new Map(); // id -> { user, expiresAt }

function getCachedUser(id) {
    const entry = userCache.get(id);
    if (entry && entry.expiresAt > Date.now()) return entry.user;
    if (entry) userCache.delete(id);
    return null;
}

async function fetchUser(id) {
    const cached = getCachedUser(id);
    if (cached) return cached;

    const user = await User.findById(id).select('-password').lean();
    if (user) userCache.set(id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    return user;
}

exports.protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];

        // Split from the fetchUser() try/catch below on purpose: only a
        // jwt.verify() failure means the TOKEN itself is bad (expired,
        // tampered, malformed) — that's a real 401. A DB error while
        // fetching the user (a Mongo reconnect blip, a transient network
        // hiccup) is not an auth failure at all, but the frontend treats
        // ANY 401 here as "wipe the session and force a re-login" (see
        // CourseApi.ts's handleUnauthorized) — misreporting a DB hiccup as
        // 401 was logging users out for a reason that had nothing to do
        // with their actual credentials.
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }

        try {
            req.user = await fetchUser(decoded.id);
        } catch (error) {
            return next(error); // real server error — 500, not a fake 401
        }

        // The token was valid, but the user it points to no longer exists
        // (e.g. the account was deleted). Without this check, req.user is
        // null and every downstream handler crashes reading req.user._id.
        // Stop here with a clean 401 instead.
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, user no longer exists' });
        }

        next();
    } else {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
}