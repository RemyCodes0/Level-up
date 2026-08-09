// routes/admin.js
const express = require("express");
const {
  getOverview,
  getRecentActivity,
  getCourseDetail,
  getAiUsage,
  getCourseCosts,
  getCourseGenerationTime,
  getCourseGenerationStats,
  getPageViewStats,
  adminDeleteCourse,
  getUserProgress,
} = require("../controllers/adminController");
const {
  getAdminPricingConfig,
  updateAdminPricingConfig,
} = require("../controllers/pricingConfigController");
const {
  getAdminMaintenanceConfig,
  updateAdminMaintenanceConfig,
} = require("../controllers/maintenanceController");
const {
  listLibraryComponents,
  getLibraryStats,
  getLibraryComponentPreview,
  approveLibraryComponent,
  rejectLibraryComponent,
  deleteLibraryComponent,
} = require("../controllers/libraryComponentController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

// Every admin route requires (1) a valid login, then (2) being the admin.
router.use(protect, requireAdmin);

router.get("/overview", getOverview);
router.get("/activity", getRecentActivity);
router.get("/ai-usage", getAiUsage);
router.get("/pageviews", getPageViewStats);
// Must be registered BEFORE /courses/:courseId — otherwise Express would
// match "generation-stats" as a :courseId value and this route would never
// be reached.
router.get("/courses/generation-stats", getCourseGenerationStats);
router.get("/courses/:courseId", getCourseDetail);
router.get("/courses/:courseId/costs", getCourseCosts);
router.get("/courses/:courseId/generation-time", getCourseGenerationTime);
router.delete("/courses/:courseId", adminDeleteCourse);
router.get("/users/:userId/progress", getUserProgress);

// Course tiers + credit packs — admin-adjustable, not hardcoded (see
// pricingConfigService.js's cache, invalidated on every PUT here).
router.get("/pricing-config", getAdminPricingConfig);
router.put("/pricing-config", updateAdminPricingConfig);

router.get("/maintenance", getAdminMaintenanceConfig);
router.put("/maintenance", updateAdminMaintenanceConfig);

// Global reusable-component library — review/approve "as we go" candidates
// proposed by real lesson generation (see services/globalComponentLibrary.js).
router.get("/library-components", listLibraryComponents);
router.get("/library-components/stats", getLibraryStats);
router.get("/library-components/:id/preview", getLibraryComponentPreview);
router.post("/library-components/:id/approve", approveLibraryComponent);
router.post("/library-components/:id/reject", rejectLibraryComponent);
router.delete("/library-components/:id", deleteLibraryComponent);

module.exports = router;

// ── Wire up in app.js (after express.json()) ────────────────────────────────
//   app.use('/api/admin', require('./routes/admin'));