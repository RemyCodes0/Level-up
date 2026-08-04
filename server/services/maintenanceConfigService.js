// Thin in-memory TTL cache in front of the MaintenanceConfig singleton — same
// pattern as pricingConfigService.js. The app.js maintenance gate reads this
// on EVERY request, so a raw Mongo read per request would be wasteful for a
// value that only changes when an admin flips the toggle.

const { getOrCreateMaintenanceConfig } = require("../models/MaintenanceConfig");

const CACHE_TTL_MS = 10_000; // short TTL — a toggle should take effect fast
let cached = null; // { config, expiresAt }

async function getMaintenanceConfig() {
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  const config = await getOrCreateMaintenanceConfig();
  cached = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

// Called after an admin PUT so the very next request reflects the change
// immediately instead of waiting out the TTL.
function invalidateMaintenanceConfigCache() {
  cached = null;
}

module.exports = { getMaintenanceConfig, invalidateMaintenanceConfigCache };
