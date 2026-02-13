const mongoose = require("mongoose");

const TutorApplicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    }, 
    
    bio: { type: String, required: true },
    subjects: [{ code: String, name: String }],
    experiences: { type: String, required: true },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    location:{
      type: String
    },
    teachingApproach:{
      type:String
    },
    teachingStyle:{
      type: String
    },
    studentBenefits:[{type: String}],
    certificates: [{ type: String }],
    idCard: { type: String },
    gpa: { type: Number },
  
    availability: [{ day: String, from: String, to: String }],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminFeedback: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TutorApplication", TutorApplicationSchema);
