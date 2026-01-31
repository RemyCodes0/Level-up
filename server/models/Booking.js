const mongoose = require("mongoose")


const bookingSchema = new mongoose.Schema({
    tutor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TutorApplication",
        required: true
    },
    student:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    slot:{
        day: String,
        from: String,
        to: String
    },
    subject:{
        type: String,
        required: true
    },
    duration:{
        type: String,
        required: true
    },
    notes: {
        type: String,
        default: ""
    },
     status:{
        type: String,
        enum: ["pending", "confirmed", "completed", "canceled"],
        default: "pending"
     },
     totalAmount: {
        type: Number
     }
    
},{timestamps:true})


module.exports = mongoose.model("Booking", bookingSchema)