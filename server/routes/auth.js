const express = require('express')
const router = express.Router();
const {registerUser, loginUser, getUsers, deleteUser} = require("../controllers/authController")


router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/getUsers', getUsers)
router.delete('/:id/delete', deleteUser)


module.exports = router;