const User = require("../models/User");
const { spendCredits, InsufficientCreditsError } = require("../services/creditService");
const { getCourseTier } = require("../services/pricingConfigService");

// The existing free-trial shape — 6 lessons, 20 questions, the existing
// 30-minute quiz timer. Course tiers are a PAID-path-only concept (per spec,
// "the existing 6-lesson free trial remains separate from this credit
// system"), so the free trial always gets exactly this snapshot regardless
// of any `tier` the client might send.
const FREE_TRIAL_COURSE_SHAPE = {
  tier: null,
  tierName: "Free Trial",
  lessonCount: 6,
  mcqCount: 20,
  timeAllocationMinutes: 30,
  creditCost: 0,
};

// Legacy/no-tier shape — this middleware is ALSO used by collab.js's room
// creation route, which has no tier-selection UI and does its own flat
// $inc(courseCredits, -1) deduction in its own handler (collabController.js).
// When no `tier` is sent, this middleware only VALIDATES (courseCredits > 0)
// and does NOT spend anything itself — preserving exactly the old behavior
// for any caller that hasn't adopted tier selection, instead of double-
// deducting or hard-rejecting a request tiers were never meant to gate.
const LEGACY_COURSE_SHAPE = {
  tier: null,
  tierName: "Standard",
  lessonCount: 6,
  mcqCount: 20,
  timeAllocationMinutes: 30,
  creditCost: 1,
};

// Checks if the user can generate a course, and — for the tier-aware paid
// path only (i.e. the request actually sent a `tier`) — atomically spends
// the selected tier's credit cost right here, before generation starts.
// courseController.js persists req.courseTierSnapshot onto the new Course
// and, for the tier path, does NOT deduct anything itself (already done
// here); for the legacy no-tier path it still does its own deduction,
// exactly as before this feature existed.
async function checkCredits(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select("courseCredits freeTrialUsed");
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.freeTrialUsed) {
      // First course is free — mark trial as used after generation starts
      // (unchanged: courseController.js still does this itself).
      req.usingFreeTrial = true;
      req.courseTierSnapshot = FREE_TRIAL_COURSE_SHAPE;
      return next();
    }

    const tierKey = req.body.tier;
    if (!tierKey) {
      // No tier selected — legacy caller (e.g. collab room creation).
      // Preserve the exact old check: just require courseCredits > 0, let
      // the calling controller deduct it itself.
      if (user.courseCredits > 0) {
        req.usingFreeTrial = false;
        req.courseTierSnapshot = LEGACY_COURSE_SHAPE;
        return next();
      }
      return res.status(402).json({
        error: "no_credits",
        message: "You have used your free course. Purchase a credit to generate more.",
      });
    }

    const tier = await getCourseTier(tierKey);
    if (!tier) {
      return res.status(400).json({
        error: "invalid_tier",
        message: "Select a valid course tier (Quick Explainer, Deeper Dive, or Full Mastery) to generate a course.",
      });
    }

    try {
      await spendCredits(req.user._id, tier.creditCost, "course_generation", { tier: tier.key });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return res.status(402).json({
          error: "no_credits",
          message: `You need ${tier.creditCost} credits for "${tier.name}" — top up to continue.`,
        });
      }
      throw err;
    }

    req.usingFreeTrial = false;
    req.courseTierSnapshot = {
      tier: tier.key,
      tierName: tier.name,
      lessonCount: tier.lessonCount,
      mcqCount: tier.mcqCount,
      timeAllocationMinutes: tier.timeAllocationMinutes,
      creditCost: tier.creditCost,
    };
    return next();
  } catch (err) {
    console.error("checkCredits error:", err);
    res.status(500).json({ error: "Failed to check credits" });
  }
}

module.exports = { checkCredits, FREE_TRIAL_COURSE_SHAPE, LEGACY_COURSE_SHAPE };
