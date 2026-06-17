const User = require("../models/User");

// Checks if the user can generate a course:
// - Free trial: 1 course for free (freeTrialUsed = false)
// - Paid: courseCredits > 0
// If neither, blocks with 402 Payment Required
async function checkCredits(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select("courseCredits freeTrialUsed");

    if (!user.freeTrialUsed) {
      // First course is free — mark trial as used after generation starts
      req.usingFreeTrial = true;
      return next();
    }

    if (user.courseCredits > 0) {
      req.usingFreeTrial = false;
      return next();
    }

    // No credits, no free trial left
    return res.status(402).json({
      error: "no_credits",
      message: "You have used your free course. Purchase a credit to generate more.",
    });
  } catch (err) {
    console.error("checkCredits error:", err);
    res.status(500).json({ error: "Failed to check credits" });
  }
}

module.exports = { checkCredits };