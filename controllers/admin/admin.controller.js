const HorseAdmin = require("../../models/admin/Admin");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ===============================
//  JWT GENERATOR
// ===============================
const generateToken = (admin) => {
  return jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

// ===============================
//  EMAIL / SMTP SETUP
// ===============================
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_PORT == 465,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// =================================================
//  ADMIN SIGNUP
// =================================================
exports.signupAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const exists = await HorseAdmin.findOne({ email });
    if (exists)
      return res
        .status(400)
        .json({ success: false, message: "Admin already exists" });

    const admin = await HorseAdmin.create({ name, email, password });
    const token = generateToken(admin);

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  ADMIN LOGIN
// =================================================
exports.loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await HorseAdmin.findOne({ email }).select("+password");
    if (!admin)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    const isMatch = await admin.comparePassword(password);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  FORGOT PASSWORD (SEND OTP)
// =================================================
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const admin = await HorseAdmin.findOne({ email });
    if (!admin)
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.otp = crypto.createHash("sha256").update(otp).digest("hex");
    admin.otpExpire = Date.now() + 5 * 60 * 1000; // 5 minutes
    await admin.save();

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: admin.email,
      subject: "Password Reset OTP",
      html: `<h3>Password Reset OTP</h3><p>Your OTP is:</p><h2>${otp}</h2><p>Valid for 5 minutes.</p>`,
    });

    res
      .status(200)
      .json({ success: true, message: "OTP sent to registered email" });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  VERIFY OTP (NEW ENDPOINT)
// =================================================
exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    const admin = await HorseAdmin.findOne({
      email,
      otp: hashedOtp,
      otpExpire: { $gt: Date.now() },
    });
    if (!admin)
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });

    res
      .status(200)
      .json({ success: true, message: "OTP verified successfully" });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  RESET PASSWORD USING OTP
// =================================================
exports.resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and new password are required",
      });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    const admin = await HorseAdmin.findOne({
      email,
      otp: hashedOtp,
      otpExpire: { $gt: Date.now() },
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    admin.password = newPassword; // hashed automatically in model
    admin.clearOtp();

    await admin.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  CHANGE PASSWORD
// =================================================
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await HorseAdmin.findById(req.admin.id).select("+password");

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "Current password is incorrect" });

    admin.password = newPassword;
    await admin.save();

    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  GET ADMIN PROFILE
// =================================================
exports.getAdminProfile = async (req, res, next) => {
  try {
    const admin = await HorseAdmin.findById(req.admin.id);
    res.status(200).json({ success: true, admin });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  UPDATE ADMIN PROFILE
// =================================================
exports.updateAdminProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    const existing = await HorseAdmin.findOne({
      email: email.toLowerCase().trim(),
      _id: { $ne: req.admin.id },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email is already used by another admin",
      });
    }

    const admin = await HorseAdmin.findByIdAndUpdate(
      req.admin.id,
      {
        name: name.trim(),
        email: email.toLowerCase().trim(),
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      admin,
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  LOGOUT
// =================================================
exports.logoutAdmin = async (req, res) => {
  res.status(200).json({ success: true, message: "Logged out successfully" });
};
