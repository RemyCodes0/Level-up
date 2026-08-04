// controllers/maintenanceController.js
//
// Read/write access to the MaintenanceConfig singleton. The public GET here
// is what the frontend's app-wide gate (App.tsx) checks on every page load
// to decide whether to show the maintenance page — no secret data in it, so
// no auth required. The admin GET/PUT (requireAdmin-gated, mounted in
// routes/admin.js) is what the Overview page's toggle uses; both read/write
// through the same cache/invalidation path as pricingConfigController.js.

const { MaintenanceConfig } = require("../models/MaintenanceConfig");
const { getMaintenanceConfig, invalidateMaintenanceConfigCache } = require("../services/maintenanceConfigService");

// ── GET /api/maintenance — public, polled by the frontend gate ─────────────
async function getPublicMaintenanceStatus(req, res) {
  try {
    const config = await getMaintenanceConfig();
    res.json({ active: config.active, message: config.message });
  } catch (err) {
    console.error("[maintenance] getPublicMaintenanceStatus error:", err.message);
    // Fail OPEN, not closed — a broken maintenance check should never itself
    // take the whole site down.
    res.json({ active: false, message: "" });
  }
}

// ── GET /api/admin/maintenance ──────────────────────────────────────────────
async function getAdminMaintenanceConfig(req, res) {
  try {
    const config = await getMaintenanceConfig();
    res.json({ active: config.active, message: config.message });
  } catch (err) {
    console.error("[maintenance] getAdminMaintenanceConfig error:", err.message);
    res.status(500).json({ error: "Failed to load maintenance config" });
  }
}

// ── PUT /api/admin/maintenance ──────────────────────────────────────────────
// Body: { active: boolean, message?: string }
async function updateAdminMaintenanceConfig(req, res) {
  try {
    const { active, message } = req.body || {};
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "active must be a boolean" });
    }

    let config = await MaintenanceConfig.findOne();
    if (!config) config = new MaintenanceConfig();
    config.active = active;
    if (typeof message === "string" && message.trim()) config.message = message.trim();
    await config.save();

    invalidateMaintenanceConfigCache();
    res.json({ active: config.active, message: config.message });
  } catch (err) {
    console.error("[maintenance] updateAdminMaintenanceConfig error:", err.message);
    res.status(500).json({ error: "Failed to update maintenance config" });
  }
}

module.exports = { getPublicMaintenanceStatus, getAdminMaintenanceConfig, updateAdminMaintenanceConfig };
