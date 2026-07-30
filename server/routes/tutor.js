const express = require('express')
const router = express.Router()
const multer = require("multer")
const {getProfile, updateProfile, apply, adminApprove, getApplications, adminDelete, getTutors, getProfileWithUserId, updateAvailability, rejectApplications, updateTutorProfile} = require('../controllers/tutorController')
const storage = multer.memoryStorage(); 
const {protect} = require('../middleware/authMiddleware');
const {requireAdmin} = require('../middleware/requireAdmin');
const upload = multer({ storage });


router.get("/allTutors", getTutors);
// Admin-only: applications previously had no auth at all — anyone could
// list every pending tutor application, approve one, or delete one.
router.get("/applications", protect, requireAdmin, getApplications);
router.get("/:id/getTutor", getProfile);
router.get("/:id/getTutorWithUserId", getProfileWithUserId);
router.put("/me", updateProfile);
router.put("/updateProfile", protect, upload.fields([
  { name: "certificates", maxCount: 5 },
  { name: "idCard", maxCount: 1 }
]), updateTutorProfile);
router.post("/apply", protect, upload.fields([
  { name: "certificates", maxCount: 5 },
  { name: "idCard", maxCount: 1 }
]), apply);
router.patch("/:id/approve", protect, requireAdmin, adminApprove);
router.delete("/:id/delete", protect, requireAdmin, adminDelete);
router.put("/:id/updateAvailability", protect, updateAvailability);
router.patch("/:id/reject", protect, rejectApplications);

module.exports = router;