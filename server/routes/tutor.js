const express = require('express')
const router = express.Router()
const {getProfile, updateProfile, apply, adminApprove, getApplications} = require('../controllers/tutorController')
const {protect} = require('../middleware/authMiddleware');

router.get('/me',  getProfile);
router.put('/me',  updateProfile);
router.post('/apply', protect, apply)
router.patch('/tutors/:id/approve', adminApprove);
router.get("/applications", getApplications)

module.exports = router;