const bcrypt = require("bcryptjs");
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");
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

// ----------------- Signup -----------------
exports.signup = async (req, res) => {
  try {
    const {
      role,
      email,
      password,
      name,
      provider = "local",
      profile,
      location,
      deviceId,
    } = req.body;

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
        errors: ["Email already registered with another account/role"],
      });
    }

    const uniqueId = await generateUniqueId(role);

    let userData = {
      uniqueId,
      name: name || profile?.name || email.split("@")[0],
      email,
      role,
      provider,
      emailVerified: provider === "google",
      isLogin: provider === "google",
      isActive: true,
      currentDevice: deviceId || null,
      currentLocation: location || undefined,
      loginHistory:
        provider === "google"
          ? [{ deviceId: deviceId || null, ip: req.ip, loginAt: new Date() }]
          : [],
    };

    // ---------------- PASSWORD ----------------
    if (provider === "local") {
      if (!password) {
        return res.status(400).json({
          success: false,
          errors: ["Password is required"],
        });
      }
      userData.password = password;
    }

    // ---------------- GOOGLE PROFILE ----------------
    if (provider === "google" && profile) {
      userData.providerId = profile.sub;
      userData.profilePicture = profile.picture || null;
      userData.firstName = profile.given_name || null;
      userData.lastName = profile.family_name || null;
      userData.locale = profile.locale || null;
      userData.rawProfile = profile;
    }

    // ---------------- CREATE USER ----------------
    const user = new Model(userData);

    // ---------------- CREATE STRIPE CUSTOMER (AUTO) ----------------
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
    });

    user.stripeCustomerId = customer.id;

    await user.save();

    const token = generateToken({ id: user._id, role: user.role });

    return res.status(201).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("[SIGNUP ERROR]", err);
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
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const user = await Model.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, errors: ["User not found"] });

    user.isLogin = false;
    user.currentDevice = null;

    await user.save();

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("[LOGOUT ERROR]", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
