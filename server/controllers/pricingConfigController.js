// controllers/pricingConfigController.js
//
// Read/write access to the PricingConfig singleton (course tiers + credit
// packs). The public GET here is what the input-chat tier cards and the
// pricing/landing pages fetch — the admin GET/PUT (requireAdmin-gated) lives
// alongside it so both read through the same cache/invalidation path.

const { getPricingConfig, invalidatePricingConfigCache } = require("../services/pricingConfigService");
const { PricingConfig } = require("../models/PricingConfig");

// ── GET /api/payment/pricing-config — public, no secret data ────────────────
async function getPublicPricingConfig(req, res) {
  try {
    const config = await getPricingConfig();
    res.json({
      courseTiers: config.courseTiers,
      creditPacks: config.creditPacks,
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
    res.json({ courseTiers: config.courseTiers, creditPacks: config.creditPacks });
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

module.exports = { getPublicPricingConfig, getAdminPricingConfig, updateAdminPricingConfig };
