const express = require("express");
const router = express.Router();
const { logPageView } = require("../controllers/trackingController");

// Public — no auth required, a page view must be logged whether or not the
// visitor is signed in. See trackingController.js for why this never blocks
// or throws back at the caller.
router.post("/pageview", logPageView);

module.exports = router;

// ── Wire up in app.js (after express.json()) ────────────────────────────────
//   app.use('/api/track', require('./routes/track'));
