const HorseAdmin = require("../../models/admin/Admin");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ===============================
//  JWT GENERATOR
// ===============================
const generateToken = (admin) => {
  return jwt.sign(
    {
      id: admin._id,
      role: admin.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

// ===============================
//  EMAIL SETUP (Custom SMTP)
// ===============================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// =================================================
//  ADMIN SIGNUP (OPTIONAL / INTERNAL USE)
// =================================================
exports.signupAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const exists = await HorseAdmin.findOne({ email });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Admin already exists",
      });
    }

    const admin = await HorseAdmin.create({
      name,
      email,
      password,
    });

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

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

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
//  FORGOT PASSWORD (SEND 6-DIGIT OTP)
// =================================================
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const admin = await HorseAdmin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const otp = admin.generateOtp(); // 6-digit OTP
    await admin.save();

    await transporter.sendMail({
      from: `"Horse Shipt Admin" <${process.env.SMTP_USER}>`,
      to: admin.email,
      subject: "Password Reset OTP",
      html: `
        <h3>Password Reset OTP</h3>
        <p>Your OTP is:</p>
        <h2>${otp}</h2>
        <p>This OTP is valid for 5 minutes.</p>
      `,
    });

    res.status(200).json({
      success: true,
      message: "OTP sent to registered email",
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  RESET PASSWORD WITH OTP
// =================================================
exports.resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

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

    admin.password = newPassword;
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
//  CHANGE PASSWORD (LOGGED-IN ADMIN)
// =================================================
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const admin = await HorseAdmin.findById(req.admin.id).select("+password");

    const isMatch = await admin.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    admin.password = newPassword;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
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

    res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  LOGOUT (JWT FRONTEND HANDLED)
// =================================================
exports.logoutAdmin = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};
