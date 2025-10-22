const mongoose = require('mongoose');
const bcrypt = require('bcrypt')

const AvailabilitySchema = new mongoose.Schema({
    day: { 
        type: String, required: true
    },
    from:{
        type: String, required: true,
    },
    to: {
        type: String,
        required: true,
    },

});


const UserSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password:{
        type: String,
        required: true,
    },
    role:{
        type: String,
        enum: ['learner', 'tutor'],
        required: true
    },
    major:{
        type: String,
    },
    year:{
        type: Number,
    },
    subjects:[{code: String, name: String}],
    hourlyRate:{
        type: Number,
        default: 0
    },
    availability:[AvailabilitySchema],
    rating:[{type: mongoose.Schema.Types.ObjectId, red:'Review'}],
    verified: {
        type: Boolean,
        default: false,
    },


},{timestamps: true})


UserSchema.pre('save', async function(next){
    if(!this.isModified('password')) {
        return next();
    }
    try{
         const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
    }catch(err){
        next(err)
    }
   
})

UserSchema.methods.matchPassword = async function(enteredPassword){
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema)