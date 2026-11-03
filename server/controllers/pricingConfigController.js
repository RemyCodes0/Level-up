// controllers/pricingConfigController.js
//
// Read/write access to the PricingConfig singleton (course tiers + credit
// packs). The public GET here is what the input-chat tier cards and the
// pricing/landing pages fetch — the admin GET/PUT (requireAdmin-gated) lives
// alongside it so both read through the same cache/invalidation path.

const { getPricingConfig, invalidatePricingConfigCache } = require("../services/pricingConfigService");
const { PricingConfig } = require("../models/PricingConfig");
const { getFreeMode, setFreeModeEnabled, setDailyLessonLimit } = require("../services/freeModeService");

// ── GET /api/payment/pricing-config — public, no secret data ────────────────
async function getPublicPricingConfig(req, res) {
  try {
    const config = await getPricingConfig();
    const freeMode = await getFreeMode();
    res.json({
      courseTiers: config.courseTiers,
      creditPacks: config.creditPacks,
      freeMode: { enabled: freeMode.enabled, dailyLessonLimit: freeMode.dailyLessonLimit },
    });
  } catch (err) {
    console.error("[pricingConfig] getPublicPricingConfig error:", err.message);
    res.status(500).json({ error: "Failed to load pricing config" });
  }
}

// ── GET /api/admin/pricing-config ───────────────────────────────────────────
async function getAdminPricingConfig(req, res) {
  try {
    const config = await getPricingConfig();
    res.json({ courseTiers: config.courseTiers, creditPacks: config.creditPacks, freeMode: await getFreeMode() });
  } catch (err) {
    console.error("[pricingConfig] getAdminPricingConfig error:", err.message);
    res.status(500).json({ error: "Failed to load pricing config" });
  }
}

// ── PUT /api/admin/pricing-config ───────────────────────────────────────────
// Body: { courseTiers: [...], creditPacks: [...] } — replaces both tables
// wholesale (simplest correct semantics for a small, admin-only, rarely-
// edited config; no per-item PATCH endpoints to keep in sync).
async function updateAdminPricingConfig(req, res) {
  try {
    const { courseTiers, creditPacks } = req.body;
    if (!Array.isArray(courseTiers) || !Array.isArray(creditPacks)) {
      return res.status(400).json({ error: "courseTiers and creditPacks must both be arrays" });
    }

    let config = await PricingConfig.findOne();
    if (!config) config = new PricingConfig();
    config.courseTiers = courseTiers;
    config.creditPacks = creditPacks;
    await config.save();

    invalidatePricingConfigCache();
    res.json({ courseTiers: config.courseTiers, creditPacks: config.creditPacks });
  } catch (err) {
    console.error("[pricingConfig] updateAdminPricingConfig error:", err.message);
    res.status(500).json({ error: "Failed to update pricing config" });
  }
}

// ── PUT /api/admin/free-mode ────────────────────────────────────────────────
// Body: { enabled?: boolean, dailyLessonLimit?: number }
async function updateFreeMode(req, res) {
  try {
    const { enabled, dailyLessonLimit } = req.body;
    if (enabled !== undefined && typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be true or false" });
    }
    if (dailyLessonLimit !== undefined && (!Number.isInteger(dailyLessonLimit) || dailyLessonLimit < 1)) {
      return res.status(400).json({ error: "dailyLessonLimit must be a whole number of at least 1" });
    }
    if (dailyLessonLimit !== undefined) await setDailyLessonLimit(dailyLessonLimit);
    const { bonusesExtended } = enabled !== undefined ? await setFreeModeEnabled(enabled) : { bonusesExtended: 0 };
    console.log(`[freeMode] ${req.user.email} set enabled=${enabled} dailyLessonLimit=${dailyLessonLimit} (bonuses extended: ${bonusesExtended})`);
    res.json({ freeMode: await getFreeMode(), bonusesExtended });
  } catch (err) {
    console.error("[pricingConfig] updateFreeMode error:", err.message);
    res.status(500).json({ error: "Failed to update free mode" });
  }
}

module.exports = { getPublicPricingConfig, getAdminPricingConfig, updateAdminPricingConfig, updateFreeMode };
