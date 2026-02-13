const User = require('../models/User');
const TutorApplication = require("../models/Tutor");
const Review = require('../models/Review');
const Booking = require('../models/Booking');

exports.getProfile = async(req,res)=>{
    try{
        const tutor= await TutorApplication.findOne({_id: req.params.id}).populate("user", "_id name email");
        if (!tutor) return res.status(404).json({message: 'tutor not found'})
        
            res.json({tutor})
    }catch(error){
        res.status(500).json({message: error.message})
    }
}


exports.getProfileWithUserId = async(req,res)=>{
    try{
        const tutor= await TutorApplication.findOne({user: req.params.id}).populate("user", "name email");
        if (!tutor) return res.status(404).json({message: 'tutor not found'})
        
            res.json({tutor})
    }catch(error){
        res.status(500).json({message: error.message})
    }
}

exports.getTutors = async (req, res) => {
  try {
    const tutors = await TutorApplication.find({status: "approved"}).populate("user", "name email").lean()

    if (tutors.length === 0) {
      return res.status(404).json({ message: "No tutors found" })
    }
      for (let t of tutors) {
      const reviews = await Review.find({ tutor: t._id });
      if (reviews.length > 0) {
        t.averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      } else {
        t.averageRating = 0;
      }
    }
 const tutorsWithSessions = await Promise.all(
  tutors.map(async (tutor) => {
    const totalSessions = await Booking.countDocuments({
      tutor: tutor._id,
      status: { $in: ["pending", "confirmed", "completed"] }
    });
    return {
      ...tutor,
      totalSessions
    };
  })
);

res.json(tutorsWithSessions);

  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: "Server error" })
  }
}

exports.updateProfile = async (req, res)=>{ 
    try{
        const user = await User.findById(req.user.id);
        if(!user) return res.status(404).json({message: 'User not found'});

        if (req.body.name) user.name = req.body.name;
        if (req.body.major) user.name = req.body.major;
        if (req.body.year) user.name = req.body.year;
        if (req.body.subject) user.name = req.body.subject;
        if (req.body.hourlyRate) user.name = req.body.hourlyRate;
        if (req.body.availability) user.name = req.body.availability;

        const updatedUser = await user.save();
        res.json(updatedUser);

    }catch(error){
        res.status(500).json({message: error.message})
    }
}


exports.updateTutorProfile = async (req, res) => {
  try {
    const tutorApp = await TutorApplication.findOne({ user: req.user._id });
    console.log(tutorApp)
    if (!tutorApp) return res.status(404).json({ message: "Tutor application not found" });

    if (req.body.bio) tutorApp.bio = req.body.bio;
    if (req.body.subjects) {
      try {
        tutorApp.subjects = JSON.parse(req.body.subjects);
      } catch (err) {
        return res.status(400).json({ message: "Invalid format for subjects" });
      }
    }
    if (req.body.experiences) tutorApp.experiences = req.body.experiences;
    if (req.body.hourlyRate) tutorApp.hourlyRate = parseFloat(req.body.hourlyRate);
    if (req.body.location) tutorApp.location = req.body.location;
    if (req.body.teachingApproach) tutorApp.teachingApproach = req.body.teachingApproach;
    if (req.body.teachingStyle) tutorApp.teachingStyle = req.body.teachingStyle;
    if (req.body.studentBenefits) {
      try {
        tutorApp.studentBenefits = JSON.parse(req.body.studentBenefits);
      } catch (err) {
        return res.status(400).json({ message: "Invalid format for studentBenefits" });
      }
    }
    if (req.body.gpa) tutorApp.gpa = parseFloat(req.body.gpa);
    if (req.body.availability) {
      try {
        tutorApp.availability = JSON.parse(req.body.availability);
      } catch (err) {
        return res.status(400).json({ message: "Invalid format for availability" });
      }
    }

if (req.files?.certificates) {
  tutorApp.certificates = req.files.certificates.map(file => file.originalname); 
}
if (req.files?.idCard && req.files.idCard[0]) {
  tutorApp.idCard = req.files.idCard[0].originalname;
}


    const updatedApp = await tutorApp.save();
    res.json({ success: true, application: updatedApp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Failed to update tutor profile" });
  }
};


exports.getApplications = async(req, res) =>{
    try{
        const applications = await TutorApplication.find().populate("user", "name email")
        res.status(200).json(applications)
    }catch(err){
        res.status(500).json(err)
    }
}

exports.apply = async (req, res) => {
  try {
    const existing = await TutorApplication.findOne({ user: req.user._id });
    if (existing && existing.status === "pending") {
      return res.status(400).json({ message: "Application already pending" });
    }

    const certificates = req.files?.certificates?.map(file => file.path) || [];
    const idCard = req.files?.idCard?.[0]?.path || null;

    const subjects = req.body.subjects ? JSON.parse(req.body.subjects) : [];
    const availability = req.body.availability ? JSON.parse(req.body.availability) : [];
    const studentBenefits = req.body.studentBenefits ? JSON.parse(req.body.studentBenefits) : [];

    const app = await TutorApplication.create({
      user: req.user._id,
      bio: req.body.bio,
      subjects,
      experiences: req.body.experiences,
      hourlyRate: parseFloat(req.body.hourlyRate),
      gpa: parseFloat(req.body.gpa),
      location: req.body.location || "",
      teachingApproach: req.body.teachingApproach || "",
      teachingStyle: req.body.teachingStyle || "",
      studentBenefits,
      certificates,
      idCard,
      availability,
    });

    res.json({ success: true, application: app });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to submit application" });
  }
};



exports.adminApprove= async(req,res)=>{
    try{

        const app = await TutorApplication.findById(req.params.id);

        if(!app){
            return res.status(404).json({message: "application not found"})

        }
        app.status ="approved";
        await app.save();


        await User.findByIdAndUpdate(app.user, {verified:true, role: 'tutor'})

        res.json({message: "The user was approved successfully"})
    }catch(err){
        res.status(500).json({message: err.message})
    }
}



exports.adminReject = async(req, res) =>{
    const app = await TutorApplication.findById(res.params.id);
    if(!app) return res.status(404).json({message: "Application not found"})

    app.status = "rejected";

    app.adminFeedback = req.body.feedback;
    await app.save();


    res.json({ message: "Tutor rejected" });
}

exports.adminDelete = async (req, res) => {
  try {
    const app = await TutorApplication.findById(req.params.id);

    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }

    await app.deleteOne();

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};



exports.updateAvailability = async (req, res) => {
  try {
    const tutorId = req.params.id; // ID of the tutor (user._id)
    const { availability } = req.body;

    if (!availability) {
      return res.status(400).json({ message: "Availability is required" });
    }

    // Update tutor availability
    const updatedTutor = await TutorApplication.findOneAndUpdate(
      { user: tutorId }, // find by user reference
      { availability },
      { new: true } // return the updated document
    );

    if (!updatedTutor) {
      return res.status(404).json({ message: "Tutor not found" });
    }

    res.status(200).json({ message: "Availability updated successfully", tutor: updatedTutor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

exports.rejectApplications =  async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await TutorApplication.findById(id);
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }
    
    application.status = 'rejected';
    application.reviewedAt = new Date();
    application.reviewedBy = req.user._id;
    
    await application.save();
    
    res.json({
      message: 'Application rejected',
      application
    });
  } catch (error) {
    console.error('Error rejecting application:', error);
    res.status(500).json({ message: 'Error rejecting application' });
  }
}

