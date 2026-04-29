const bcrypt = require("bcryptjs");
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const Otp = require("../models/common/Otp");
const generateToken = require("../utils/generateToken");
const { sendOtpMail } = require("../utils/mailService");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ----------------- Utility Functions -----------------
const getModel = (role) => {
  if (role === "shipper") return Shipper;
  if (role === "customer") return Customer;
  return null;
};

const generateUniqueId = async (role) => {
  const prefix = role === "shipper" ? "HS" : "HC";
  const Model = getModel(role);

  let id;
  let exists = true;

  while (exists) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    id = `${prefix}${randomNum}`;
    const existing = await Model.findOne({ uniqueId: id });
    if (!existing) exists = false;
  }
  return id;
};

// ----------------- Signup (SEND OTP ONLY) -----------------
exports.signup = async (req, res) => {
  try {
    const { role, email, password, name, provider = "local" } = req.body;

    if (!role || !email) {
      return res.status(400).json({
        success: false,
        errors: ["Role and email are required"],
      });
    }

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    // ---------------- CHECK DUPLICATE EMAIL ----------------
    const existingShipper = await Shipper.findOne({ email });
    const existingCustomer = await Customer.findOne({ email });

    if (existingShipper || existingCustomer) {
      return res.status(409).json({
        success: false,
        errors: ["Email already registered"],
      });
    }

    // ---------------- GOOGLE SIGNUP ----------------
    if (provider === "google") {
      return res.status(200).json({
        success: true,
        message: "Continue with Google OAuth",
      });
    }

    // ---------------- LOCAL SIGNUP → SEND OTP ----------------
    if (!password) {
      return res.status(400).json({
        success: false,
        errors: ["Password is required"],
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email, role, purpose: "signup" });

    await Otp.create({
      email,
      otp,
      role,
      purpose: "signup",
      data: { password, name },
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await sendOtpMail(email, otp);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email",
    });
  } catch (err) {
    console.error("[SIGNUP ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- VERIFY OTP + CREATE ACCOUNT -----------------
exports.verifyOtpAndCreateAccount = async (req, res) => {
  try {
    const { email, otp, role, deviceId, location } = req.body;

    const record = await Otp.findOne({ email, otp, role, purpose: "signup" });

    if (!record) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid OTP"],
      });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        errors: ["OTP expired"],
      });
    }

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    const { password, name } = record.data;

    if (!password) {
      return res.status(400).json({
        success: false,
        errors: ["Signup details expired. Please signup again"],
      });
    }

    const existingUser = await Model.findOne({ email });
    if (existingUser) {
      await Otp.deleteMany({ email, role, purpose: "signup" });
      return res.status(409).json({
        success: false,
        errors: ["Email already registered"],
      });
    }

    const uniqueId = await generateUniqueId(role);

    let userData = {
      uniqueId,
      name: name || email.split("@")[0],
      email,
      password,
      role,
      provider: "local",
      emailVerified: true,
      isLogin: true,
      isActive: true,
      currentDevice: deviceId || null,
      currentLocation: location || undefined,
      loginHistory: [
        { deviceId: deviceId || null, ip: req.ip, loginAt: new Date() },
      ],
    };

    const user = new Model(userData);

    // ---------------- STRIPE ----------------
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
    });

    user.stripeCustomerId = customer.id;

    await user.save();

    // cleanup OTP
    await Otp.deleteMany({ email, role, purpose: "signup" });

    const token = generateToken({ id: user._id, role: user.role });

    return res.status(201).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("[OTP VERIFY ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- Forgot Password (SEND OTP) -----------------
exports.forgotPassword = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!role || !email) {
      return res.status(400).json({
        success: false,
        errors: ["Role and email are required"],
      });
    }

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    const user = await Model.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        errors: ["No account found with this email"],
      });
    }

    if (user.provider === "google" && !user.password) {
      return res.status(400).json({
        success: false,
        errors: ["This account uses Google login"],
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email, role, purpose: "forgot-password" });

    await Otp.create({
      email,
      otp,
      role,
      purpose: "forgot-password",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await sendOtpMail(email, otp);

    return res.status(200).json({
      success: true,
      message: "Password reset OTP sent to email",
    });
  } catch (err) {
    console.error("[FORGOT PASSWORD ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- Reset Password (VERIFY OTP + UPDATE PASSWORD) -----------------
exports.resetPassword = async (req, res) => {
  try {
    const { email, role, otp, password } = req.body;

    if (!role || !email || !otp || !password) {
      return res.status(400).json({
        success: false,
        errors: ["Email, role, OTP and password are required"],
      });
    }

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    const record = await Otp.findOne({
      email,
      otp,
      role,
      purpose: "forgot-password",
    });

    if (!record) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid OTP"],
      });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        errors: ["OTP expired"],
      });
    }

    const user = await Model.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        errors: ["User not found"],
      });
    }

    user.password = password;
    user.provider = "local";
    await user.save();

    await Otp.deleteMany({ email, role, purpose: "forgot-password" });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (err) {
    console.error("[RESET PASSWORD ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- Login -----------------
exports.login = async (req, res) => {
  try {
    const { role, email, password, provider, profile, deviceId, location } =
      req.body;

    if (!role || !email) {
      return res.status(400).json({
        success: false,
        errors: ["Role and email are required"],
      });
    }

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    const user = await Model.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ["Invalid credentials"],
      });
    }

    // ---------------- BLOCK UNVERIFIED USERS ----------------
    if (!user.emailVerified) {
      return res.status(401).json({
        success: false,
        errors: ["Please verify your email first"],
      });
    }

    // ---------------- GOOGLE LOGIN ----------------
    if (provider === "google" && profile) {
      if (user.providerId !== profile.sub) {
        return res.status(401).json({
          success: false,
          errors: ["Google account mismatch"],
        });
      }
    } else {
      // ---------------- LOCAL LOGIN ----------------
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          errors: ["Invalid credentials"],
        });
      }
    }

    // ---------------- UPDATE LOGIN INFO ----------------
    user.isLogin = true;
    user.currentDevice = deviceId || user.currentDevice;
    user.currentLocation = location || user.currentLocation;

    user.loginHistory.push({
      deviceId: deviceId || null,
      ip: req.ip,
      loginAt: new Date(),
    });

    await user.save();

    const token = generateToken({ id: user._id, role: user.role });

    return res.status(200).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- Logout -----------------
exports.logout = async (req, res) => {
  try {
    const { role, userId } = req.body;

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    const user = await Model.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        errors: ["User not found"],
      });
    }

    user.isLogin = false;
    user.currentDevice = null;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error("[LOGOUT ERROR]", err);
    res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};
