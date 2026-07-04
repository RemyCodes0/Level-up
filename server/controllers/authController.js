const crypto = require("crypto");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const sendEmail = require("../services/emailService");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// ── Signup — creates user + sends verification email ────────────────────────
exports.registerUser = async (req, res) => {
  const { name, email, password, role, major, year, subjects, ref } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    // Generate a verification token (64-char hex string, expires in 24h)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Validate referral code if provided — only store it if the referrer
    // actually exists, to avoid storing dangling/fake codes
    let referredBy = null;
    if (ref) {
      const referrer = await User.findOne({ referralCode: ref }).select("_id");
      if (referrer) referredBy = ref;
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      major,
      year,
      subjects,
      verificationToken,
      verificationTokenExpires,
      ...(referredBy ? { referredBy } : {}),
    });

    // Build verification link — CLIENT_URL should point to your frontend
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: email,
      subject: "Verify your Level Up account",
      text: `Hi ${name},\n\nWelcome to Level Up! Please verify your email by clicking the link below:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create this account, you can safely ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Welcome to Level Up!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            Hi ${name}, thanks for signing up. Please verify your email to get started:
          </p>
          <a href="${verifyUrl}"
             style="display: inline-block; margin: 24px 0; padding: 12px 28px; background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
            Verify my email
          </a>
          <p style="color: #94a3b8; font-size: 13px;">
            This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    // Don't return a JWT — user must verify first
    res.status(201).json({
      message: "Account created! Check your email to verify your account.",
      requiresVerification: true,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Verify email — called when user clicks the link ─────────────────────────
exports.verifyEmail = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: "Missing verification token" });

  try {
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired verification link. Please request a new one.",
      });
    }

    user.verified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    res.json({ message: "Email verified successfully! You can now log in." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Resend verification email ───────────────────────────────────────────────
exports.resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const user = await User.findOne({ email });

    // Don't reveal whether the email exists — always return success
    if (!user || user.verified) {
      return res.json({ message: "If that email exists and isn't verified, a new link has been sent." });
    }

    // Generate a fresh token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: email,
      subject: "Verify your Level Up account",
      text: `Hi ${user.name},\n\nHere's your new verification link:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">New verification link</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            Hi ${user.name}, here's your new verification link:
          </p>
          <a href="${verifyUrl}"
             style="display: inline-block; margin: 24px 0; padding: 12px 28px; background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
            Verify my email
          </a>
          <p style="color: #94a3b8; font-size: 13px;">This link expires in 24 hours.</p>
        </div>
      `,
    });

    res.json({ message: "If that email exists and isn't verified, a new link has been sent." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Login — blocks unverified users ─────────────────────────────────────────
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // Block login if email not verified
    if (!user.verified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        needsVerification: true,
        email: user.email,
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Existing CRUD handlers (unchanged) ──────────────────────────────────────

exports.getUsers = async (req, res) => {
  try {
    const user = await User.find();
    res.status(200).json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted", user });
  } catch (err) {
    res.status(500).json({ message: err });
  }
};

exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "No user found" });
    }
    res.status(200).json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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