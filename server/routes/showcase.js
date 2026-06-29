// routes/showcase.js
const express = require("express");
const { getShowcaseVideos } = require("../controllers/showcaseController");

const router = express.Router();

// Intentionally PUBLIC — no protect/requireAdmin. Landing page visitors are
// anonymous, and this only ever serves the hand-picked courses listed in
// SHOWCASE_COURSE_IDS, never arbitrary user data.
router.get("/", getShowcaseVideos);

module.exports = router;

// ── Wire up in app.js (after express.json()) ────────────────────────────────
//   app.use('/api/showcase', require('./routes/showcase'));