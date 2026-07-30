const express = require('express')
const router = express.Router();
const {registerUser, loginUser, getUsers, deleteUser, getUser, updateUser, adminUpdateUser} = require("../controllers/authController")
const { verifyEmail, resendVerification, forgotPassword, resetPassword } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/requireAdmin");

router.post('/register', registerUser);
router.post('/login', loginUser);
// Admin-only: list/delete ANY user. Previously had no auth at all.
router.get('/getUsers', protect, requireAdmin, getUsers)
router.delete('/:id/delete', protect, requireAdmin, deleteUser)
// Self-service or admin: getUser/updateUser previously had no auth at all
// either, meaning anyone could view/edit any account by guessing an id.
// `protect` requires a valid login; the owner-or-admin check itself lives
// inside the controller (getUser/updateUser), same as every other
// self-service endpoint in this app.
router.get("/:id/user", protect, getUser)
router.put("/:id", protect, updateUser);
router.patch("/:id/admin", protect, requireAdmin, adminUpdateUser);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
