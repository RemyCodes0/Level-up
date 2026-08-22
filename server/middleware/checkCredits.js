const User = require("../models/User");
const { spendCredits, getSpendableBalance, InsufficientCreditsError } = require("../services/creditService");
const { getCourseTier } = require("../services/pricingConfigService");

// REMOVED (2026-08-21, per explicit request): the free-trial bypass — a
// brand-new user's first course used to skip tier selection entirely and
// get a fixed 6-lesson/20-MCQ course for $0, never touching their credit
// balance. That's gone now that every account starts with a real, spendable
// 100-credit signup bonus (see creditService.js's own comment on the two-
// bucket balance model) — every course, including a user's very first one,
// goes through the SAME tier-selection + spendCredits() path below, same as
// a returning user. FREE_TRIAL_COURSE_SHAPE is deliberately not kept around
// as dead code — nothing should construct that shape anymore.

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
// path (i.e. the request sent a `tier`) — atomically spends the selected
// tier's credit cost right here, before generation starts.
// courseController.js persists req.courseTierSnapshot onto the new Course
// and, for the tier path, does NOT deduct anything itself (already done
// here); for the legacy no-tier path it still does its own deduction. Every
// caller goes through one of these two branches now — there is no more
// free bypass; a brand-new user spends down their signup-bonus balance the
// same way anyone else spends credits.
async function checkCredits(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select(
      "courseCredits signupBonusCredits signupBonusExpiresAt"
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    const tierKey = req.body.tier;
    if (!tierKey) {
      // No tier selected — legacy caller (e.g. collab room creation), which
      // does its own flat deduction rather than a tier's real creditCost.
      // FIX: this used to check only user.courseCredits > 0, missing the
      // signup-bonus bucket entirely — a brand-new user with only their
      // 100-credit signup bonus (courseCredits still 0) would be wrongly
      // rejected here even though they have a real spendable balance.
      // getSpendableBalance is the same combined-balance check the tier
      // path below already uses via spendCredits.
      if (getSpendableBalance(user) > 0) {
        req.usingFreeTrial = false;
        req.courseTierSnapshot = LEGACY_COURSE_SHAPE;
        return next();
      }
      return res.status(402).json({
        error: "no_credits",
        message: "You're out of credits. Purchase more to generate another course.",
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

module.exports = { checkCredits, LEGACY_COURSE_SHAPE };
