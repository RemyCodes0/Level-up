const mongoose = require("mongoose")

const reviewSchema = new mongoose.Schema(
    {
        tutor:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        student:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        rating:{
            type: Number, 
            required: true,
            min: 1,
            max: 5
        },
        comment:{
            type: String,
            required: true,
        }
    },
    {timestamps:true}
)

// tutor is the single most-queried field (tutor profile pages, the ratings
// aggregate in tutorController, addReview's duplicate check); student is
// queried on the "my reviews" and duplicate-review-check paths.
reviewSchema.index({ tutor: 1 })
reviewSchema.index({ student: 1 })

module.exports = mongoose.model("Review", reviewSchema)