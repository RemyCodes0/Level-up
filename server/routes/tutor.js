const express = require('express')
const router = express.Router()
const multer = require("multer")
const {getProfile, updateProfile, apply, adminApprove, getApplications, adminDelete, getTutors, getProfileWithUserId, updateAvailability, rejectApplications} = require('../controllers/tutorController')
const storage = multer.memoryStorage(); 
const {protect} = require('../middleware/authMiddleware');
const upload = multer({ storage });


router.get('/:id/getTutor',  getProfile);
router.get('/:id/getTutorWithUserId',  getProfileWithUserId);
router.put('/me',  updateProfile);
router.post('/apply', protect, upload.fields([
    {name:"certificates", maxCount: 5},
    {name:"idCard", maxCount:1}
]), apply)
router.patch('/:id/approve', adminApprove);
router.get("/applications", getApplications);
router.delete("/:id/delete", adminDelete);
router.get("/allTutors", getTutors)
router.put("/:id/updateAvailability", protect, updateAvailability)
router.patch('/:id/reject', protect, rejectApplications);

module.exports = router;