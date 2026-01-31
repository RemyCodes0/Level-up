const User = require('../models/User');
const TutorApplication = require("../models/Tutor");

exports.getProfile = async(req,res)=>{
    try{
        const tutor= await TutorApplication.findOne({_id: req.params.id}).populate("user", "name email");
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
    const tutors = await TutorApplication.find({status: "approved"}).populate("user", "name email")

    if (tutors.length === 0) {
      return res.status(404).json({ message: "No tutors found" })
    }

    return res.status(200).json(tutors)
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

exports.getApplications = async(req, res) =>{
    try{
        const applications = await TutorApplication.find().populate("user", "name email")
        res.status(200).json(applications)
    }catch(err){
        res.status(500).json(err)
    }
}

exports.apply =async(req,res) =>{
    try{
        const existing = await TutorApplication.findOne({user: req.user._id})

        if(existing && existing.status == "pending"){
            return res.status(400).json({message: "Application already pending"});

        }
    
    const certificates = req.files?.certificates?.map(
        file => file.path
    );
    const idCard = req.files?.idCard?.[0]?.path;
    const app = await TutorApplication.create({
        user: req.user._id,
        bio: req.body.bio, 
        subjects: JSON.parse(req.body.subjects),
        experiences: req.body.experiences,
        hourlyRate: req.body.hourlyRate,
        certificates,
        idCard,
        gpa: req.body.gpa,
        availability: JSON.parse(req.body.availability)
    });

    res.json({success: true, application: app})

    }catch(err){
        res.status(500).json({message: err.message})
    }
}


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
