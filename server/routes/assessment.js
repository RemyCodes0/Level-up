// routes/assessment.js
const express = require("express");
const {
  nextQuestionHandler,
  determineLevelHandler,
} = require("../controllers/levelAssessmentController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Both require login, same as course generation.
router.post("/next-question", protect, nextQuestionHandler);
router.post("/determine-level", protect, determineLevelHandler);

module.exports = router;

// ── Wire this up in app.js (AFTER express.json(), like your other routes) ──
//   const assessmentRoutes = require('./routes/assessment');
//   app.use('/api/assessment', assessmentRoutes);