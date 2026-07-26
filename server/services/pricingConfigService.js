// Thin in-memory TTL cache in front of the PricingConfig singleton — same
// lazy-expiry-cache pattern authMiddleware.js already uses for per-request
// user lookups. Course generation and checkout both read this on every
// request; without the cache that's an extra Mongo round trip per request
// for values that change only when an admin edits them.

const { getOrCreatePricingConfig } = require("../models/PricingConfig");

const CACHE_TTL_MS = 30_000;
let cached = null; // { config, expiresAt }

async function getPricingConfig() {
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  const config = await getOrCreatePricingConfig();
  cached = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

// Called after an admin PUT so the next read reflects the change immediately
// instead of waiting out the TTL.
function invalidatePricingConfigCache() {
  cached = null;
}

async function getCourseTier(key) {
  const config = await getPricingConfig();
  return config.courseTiers.find((t) => t.key === key) || null;
}

async function getCreditPack(key) {
  const config = await getPricingConfig();
  return config.creditPacks.find((p) => p.key === key) || null;
}

module.exports = {
  getPricingConfig,
  invalidatePricingConfigCache,
  getCourseTier,
  getCreditPack,
};
