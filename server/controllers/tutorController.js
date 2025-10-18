const User = require('../models/User');


exports.getProfile = async(req,res)=>{
    try{
        const user= await User.findById(req.user.id);
        if (!user) return res.status(404).json({message: 'User not found'})
        
            res.json(user)
    }catch(error){
        res.status(500).json({message: error.message})
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