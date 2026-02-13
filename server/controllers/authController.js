const User = require('../models/User')
const jwt = require('jsonwebtoken')

const generateToken = (id) =>{
    return jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: '30d'})
};

exports.registerUser= async(req, res)=>{
    const {name, email, password, role, major, year, subjects} = req.body;
    try{
        const userExists = await User.findOne({email});
        if (userExists) return res.status(400).json({message: 'User already exists'});

        const user = await User.create({name, email, password, role, major, year, subjects})

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),

        });

    }catch(error){
        res.status(500).json({message:error.message})
    }
}


exports.loginUser = async(req,res) =>{
    const {email, password} = req.body;
    try{
        const user = await User.findOne({email});
        if(!user) return res.status(401).json({message: 'invalid credentials'});
    
        const isMatch = await user.matchPassword(password);
        if(!isMatch) return res.status(401).json({message: 'invalid credentials'})

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),

        });
    }catch(error){
        res.status(500).json({message: error.message})
    }
}


exports.getUsers = async(req, res) =>{
    try{
        const user = await User.find()
        res.status(200).json({user})
    }catch(err){
        res.status(500).json({message: err.message})
    }
}

exports.deleteUser = async(req, res)=>{
    try{
        const user = await User.findByIdAndDelete(res.params.id)
        if(!user){
            return res.status(404).json({message: "User not found"})
        }
        res.status(200).json({message: "User deleted", user})

    }catch(err){
        res.status(500).json({message: err})
    }
}

exports.getUser = async(req, res)=>{
    try{
        const user = await User.findById(req.params.id)
        if(!user){
            res.status(404).json("No user found")
        }
        res.status(200).json({user})

    }catch(err){
        res.status(500).json({message: err})
    }
}

exports.updateUser = async (req, res) => {
  const userId = req.params.id;

  try {
    
    let user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    
    const allowedFields = ["name", "email", "major", "year", "subjects", "password"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    const updatedUser = await user.save();

    res.status(200).json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      major: updatedUser.major,
      year: updatedUser.year,
      subjects: updatedUser.subjects,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
