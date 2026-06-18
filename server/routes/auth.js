const express = require('express')
const router = express.Router();
const {registerUser, loginUser, getUsers, deleteUser, getUser, updateUser} = require("../controllers/authController")
const { verifyEmail, resendVerification } = require("../controllers/authController");

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/getUsers', getUsers)
router.delete('/:id/delete', deleteUser)
router.get("/:id/user", getUser)
router.put("/:id", updateUser);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);

module.exports = router;
