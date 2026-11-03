const mongoose = require("mongoose");

const courseTierSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    lessonCount: { type: Number, required: true },
    mcqCount: { type: Number, required: true },
    timeAllocationMinutes: { type: Number, required: true },
    creditCost: { type: Number, required: true },
  },
  { _id: false }
);

const creditPackSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    credits: { type: Number, required: true },
    priceCents: { type: Number, required: true },
    // e.g. "Best Value" — shown as a badge on the pricing/landing pages. null
    // for packs with no badge.
    badge: { type: String, default: null },
  },
  { _id: false }
);

// Singleton — exactly one document is ever expected to exist (enforced by
// convention via getOrCreatePricingConfig below, not a DB-level constraint,
// same as this codebase's other config-shaped singletons don't bother with
// one either). Holds the two tables this feature needs to keep out of
// hardcoded JS so they can be tuned post-launch without a redeploy.
const pricingConfigSchema = new mongoose.Schema(
  {
    courseTiers: [courseTierSchema],
    creditPacks: [creditPackSchema],
    // See services/freeModeService.js. The daily limit counts lessons, not
    // courses, because lessons are what actually cost money to generate.
    freeMode: {
      enabled: { type: Boolean, default: false },
      startedAt: { type: Date, default: null },
      dailyLessonLimit: { type: Number, default: 6 },
    },
  },
  { timestamps: true }
);

const PricingConfig = mongoose.model("PricingConfig", pricingConfigSchema);

// Values from the credit-monetization spec — used only the very first time
// this singleton is read (see getOrCreatePricingConfig), so the config
// materializes itself with sane defaults instead of needing a migration
// script someone has to remember to run.
const DEFAULT_COURSE_TIERS = [
  {
    key: "quick_explainer",
    name: "Quick Explainer",
    description: "For a fast overview",
    lessonCount: 1,
    mcqCount: 10,
    timeAllocationMinutes: 10,
    creditCost: 20,
  },
  {
    key: "deeper_dive",
    name: "Deeper Dive",
    description: "For building real understanding",
    lessonCount: 3,
    mcqCount: 15,
    timeAllocationMinutes: 15,
    creditCost: 40,
  },
  {
    key: "full_mastery",
    name: "Full Mastery",
    description: "For a strong, complete background",
    lessonCount: 6,
    mcqCount: 20,
    timeAllocationMinutes: 20,
    creditCost: 70,
  },
];

const DEFAULT_CREDIT_PACKS = [
  { key: "pack_100", credits: 100, priceCents: 299, badge: null },
  { key: "pack_500", credits: 500, priceCents: 999, badge: "Best Value" },
  { key: "pack_1200", credits: 1200, priceCents: 1999, badge: null },
];

async function getOrCreatePricingConfig() {
  let config = await PricingConfig.findOne();
  if (!config) {
    config = await PricingConfig.create({
      courseTiers: DEFAULT_COURSE_TIERS,
      creditPacks: DEFAULT_CREDIT_PACKS,
    });
  }
  return config;
}

module.exports = {
  PricingConfig,
  getOrCreatePricingConfig,
  DEFAULT_COURSE_TIERS,
  DEFAULT_CREDIT_PACKS,
};
