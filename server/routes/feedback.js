const { Router } = require("express");
const { createFeedback, adminGetFeedback, adminDeleteFeedback } = require("../controllers/feedbackController");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = Router();

// Optional auth — attaches req.user if a valid token is present,
// but doesn't block the request if there's no token (so showcase
// visitors can submit feedback too).
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
    } catch {
      res.status(500).json({message: "not a user"})
    }
  }
  next();
}

router.post("/", optionalAuth, createFeedback);
router.get("/admin", protect, requireAdmin, adminGetFeedback);
router.delete("/admin/:id", protect, requireAdmin, adminDeleteFeedback);

module.exports = router;