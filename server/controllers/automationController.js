// controllers/automationController.js
//
// Admin-only control panel for the TikTok auto-posting loop
// (automationService.js). Mounted under /api/admin (routes/admin.js), so
// already behind protect+requireAdmin.

const { AutomationConfig, getOrCreateAutomationConfig } = require("../models/AutomationConfig");
const AutomationPost = require("../models/AutomationPost");
const { restartScheduler, runNow } = require("../services/automationService");

// ── GET /api/admin/automation/config ────────────────────────────────────────
async function getAutomationConfig(req, res) {
  try {
    const config = await getOrCreateAutomationConfig();
    res.json(config);
  } catch (err) {
    console.error("[automation] getAutomationConfig error:", err.message);
    res.status(500).json({ error: "Failed to load automation config" });
  }
}

// ── PUT /api/admin/automation/config ────────────────────────────────────────
// Body: { enabled?: boolean, frequencyHours?: number }. Reschedules the
// timer immediately against the new values — the change takes effect now,
// it does not wait out whatever interval was already in flight.
async function updateAutomationConfig(req, res) {
  try {
    const { enabled, frequencyHours } = req.body || {};

    if (frequencyHours !== undefined && (typeof frequencyHours !== "number" || frequencyHours < 1)) {
      return res.status(400).json({ error: "frequencyHours must be a number of at least 1" });
    }

    let config = await getOrCreateAutomationConfig();
    if (typeof enabled === "boolean") config.enabled = enabled;
    if (typeof frequencyHours === "number") config.frequencyHours = frequencyHours;
    await config.save();

    await restartScheduler();
    res.json(await AutomationConfig.findOne());
  } catch (err) {
    console.error("[automation] updateAutomationConfig error:", err.message);
    res.status(500).json({ error: "Failed to update automation config" });
  }
}

// ── GET /api/admin/automation/history ───────────────────────────────────────
async function getAutomationHistory(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const posts = await AutomationPost.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ posts });
  } catch (err) {
    console.error("[automation] getAutomationHistory error:", err.message);
    res.status(500).json({ error: "Failed to load automation history" });
  }
}

// ── POST /api/admin/automation/run-now ──────────────────────────────────────
// Fires a cycle immediately without waiting for the schedule — full
// generation+render+post takes minutes, so this responds right away and
// the cycle runs in the background (same pattern as real course
// generation's own route); check /history to see it progress.
async function runAutomationNow(req, res) {
  try {
    runNow().catch((err) => console.error("[automation] runNow background error:", err.message));
    res.json({ started: true });
  } catch (err) {
    console.error("[automation] runAutomationNow error:", err.message);
    res.status(500).json({ error: "Failed to start automation run" });
  }
}

module.exports = { getAutomationConfig, updateAutomationConfig, getAutomationHistory, runAutomationNow };
