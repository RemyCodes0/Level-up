const express = require('express')
const router = express.Router();
const {registerUser, loginUser, getUsers, deleteUser, getUser} = require("../controllers/authController")


router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/getUsers', getUsers)
router.delete('/:id/delete', deleteUser)
router.get("/:id/user", getUser)


module.exports = router;