const mongoose = require("mongoose");

// Singleton — exactly one document is ever expected to exist (enforced by
// convention via getOrCreateMaintenanceConfig below, same pattern as
// PricingConfig.js). Toggled from the admin Overview page; read on every
// request by the maintenance gate in app.js (through the cached service, not
// directly) and by the frontend's app-wide gate.
const maintenanceConfigSchema = new mongoose.Schema(
  {
    active: { type: Boolean, default: false },
    message: {
      type: String,
      default: "We're down for scheduled maintenance. We'll be back shortly — thanks for your patience.",
    },
  },
  { timestamps: true }
);

const MaintenanceConfig = mongoose.model("MaintenanceConfig", maintenanceConfigSchema);

async function getOrCreateMaintenanceConfig() {
  let config = await MaintenanceConfig.findOne();
  if (!config) config = await MaintenanceConfig.create({});
  return config;
}

module.exports = { MaintenanceConfig, getOrCreateMaintenanceConfig };
