const mongoose = require("mongoose");

// Singleton — exactly one document is ever expected to exist, same
// convention as PricingConfig.js/MaintenanceConfig.js (enforced by
// getOrCreateAutomationConfig below, not a DB-level constraint). Controls
// the TikTok auto-posting loop (see automationService.js): pick a STEM
// topic → generate a 1-lesson course → render it to MP4 → post to TikTok
// via Buffer → delete the file.
const automationConfigSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    // How often a new cycle runs. Adjustable from the admin Automation page
    // — changing it reschedules the next run relative to now, it does not
    // wait out the OLD interval first.
    frequencyHours: { type: Number, default: 6, min: 1 },
    // Which platforms to post to. TikTok only for now (per the current
    // scope) — plural/array from day one so adding another platform later
    // is a data change, not a schema change.
    platforms: { type: [String], default: ["tiktok"] },
    lastRunAt: { type: Date, default: null },
    // Persisted (not just an in-memory timer) so a server restart — routine
    // on most hosts — resumes on schedule instead of silently going quiet
    // until someone notices. See automationService.js's boot logic.
    nextRunAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const AutomationConfig = mongoose.model("AutomationConfig", automationConfigSchema);

async function getOrCreateAutomationConfig() {
  let config = await AutomationConfig.findOne();
  if (!config) config = await AutomationConfig.create({});
  return config;
}

module.exports = { AutomationConfig, getOrCreateAutomationConfig };
