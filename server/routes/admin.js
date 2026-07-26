// routes/admin.js
const express = require("express");
const {
  getOverview,
  getRecentActivity,
  getCourseDetail,
} = require("../controllers/adminController");
const {
  getAdminPricingConfig,
  updateAdminPricingConfig,
} = require("../controllers/pricingConfigController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

// Every admin route requires (1) a valid login, then (2) being the admin.
router.use(protect, requireAdmin);

router.get("/overview", getOverview);
router.get("/activity", getRecentActivity);
router.get("/courses/:courseId", getCourseDetail);

// Course tiers + credit packs — admin-adjustable, not hardcoded (see
// pricingConfigService.js's cache, invalidated on every PUT here).
router.get("/pricing-config", getAdminPricingConfig);
router.put("/pricing-config", updateAdminPricingConfig);

module.exports = router;

// ── Wire up in app.js (after express.json()) ────────────────────────────────
//   app.use('/api/admin', require('./routes/admin'));