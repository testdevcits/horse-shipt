const bcrypt = require("bcryptjs");
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

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
    console.log("[SIGNUP] Request body:", req.body);

    const {
      role,
      email,
      password,
      name,
      provider,
      profile,
      location,
      deviceId,
    } = req.body;

    if (!role || !email) {
      console.log("[SIGNUP] Missing role or email");
      return res
        .status(400)
        .json({ success: false, errors: ["Role and email are required"] });
    }

    const Model = getModel(role);
    if (!Model) {
      console.log("[SIGNUP] Invalid role:", role);
      return res.status(400).json({ success: false, errors: ["Invalid role"] });
    }

    // Prevent duplicate emails across roles
    const existingShipper = await Shipper.findOne({ email });
    const existingCustomer = await Customer.findOne({ email });
    if (existingShipper || existingCustomer) {
      console.log("[SIGNUP] Email already exists in another role:", email);
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
      provider: provider || "local",
      emailVerified: provider === "google",
      isLogin: provider === "google" ? true : false,
      isActive: true,
      currentDevice: deviceId || null,
      currentLocation: location || undefined,
      loginHistory:
        provider === "google"
          ? [
              {
                deviceId: deviceId || null,
                ip: req.ip || null,
                loginAt: new Date(),
              },
            ]
          : [],
    };

    // Handle local provider (hash password)
    if (provider === "local") {
      if (!password) {
        console.log("[SIGNUP] Password missing for local signup");
        return res
          .status(400)
          .json({ success: false, errors: ["Password is required"] });
      }
      const salt = await bcrypt.genSalt(10);
      userData.password = await bcrypt.hash(password, salt);
    } else if (provider === "google" && profile) {
      userData.providerId = profile.sub;
      userData.profilePicture = profile.picture || null;
      userData.firstName = profile.given_name || null;
      userData.lastName = profile.family_name || null;
      userData.locale = profile.locale || null;
      userData.rawProfile = profile;
    }

    const user = new Model(userData);
    await user.save();
    console.log("[SIGNUP] User created:", user._id);

    const token = generateToken({ id: user._id, role: user.role });

    res.status(201).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("[SIGNUP] Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ----------------- Login -----------------
exports.login = async (req, res) => {
  try {
    console.log("[LOGIN] Request body:", req.body);

    const { role, email, password, provider, profile, deviceId, location } =
      req.body;

    if (!role || !email) {
      console.log("[LOGIN] Missing role or email");
      return res
        .status(400)
        .json({ success: false, errors: ["Role and email are required"] });
    }

    const Model = getModel(role);
    if (!Model) {
      console.log("[LOGIN] Invalid role:", role);
      return res.status(400).json({ success: false, errors: ["Invalid role"] });
    }

    let user;

    if (provider === "google" && profile) {
      user = await Model.findOne({ email, providerId: profile.sub });
      if (!user) {
        console.log("[LOGIN] Google user not found:", email);
        return res.status(404).json({
          success: false,
          errors: ["Google user not found. Please signup first."],
        });
      }
    } else {
      user = await Model.findOne({ email });
      if (!user) {
        console.log("[LOGIN] Local user not found:", email);
        return res
          .status(401)
          .json({ success: false, errors: ["Invalid credentials"] });
      }

      if (!user.emailVerified) {
        console.log("[LOGIN] Email not verified:", email);
        return res
          .status(403)
          .json({ success: false, errors: ["Email not verified"] });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.log("[LOGIN] Password mismatch for:", email);
        return res
          .status(401)
          .json({ success: false, errors: ["Invalid credentials"] });
      }

      if (!user.isActive) {
        console.log("[LOGIN] Account blocked:", email);
        return res
          .status(403)
          .json({ success: false, errors: ["Account is blocked"] });
      }
    }

    // Update login info
    user.isLogin = true;
    user.currentDevice = deviceId || user.currentDevice;
    user.currentLocation = location || user.currentLocation;
    user.loginHistory.push({
      deviceId: deviceId || null,
      ip: req.ip || null,
      loginAt: new Date(),
    });

    await user.save();
    console.log("[LOGIN] User logged in:", user._id);

    const token = generateToken({ id: user._id, role: user.role });

    res.status(200).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("[LOGIN] Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ----------------- Logout -----------------
exports.logout = async (req, res) => {
  try {
    console.log("[LOGOUT] Request body:", req.body);
    const { role, userId } = req.body;

    const Model = getModel(role);
    if (!Model) {
      console.log("[LOGOUT] Invalid role:", role);
      return res.status(400).json({ success: false, errors: ["Invalid role"] });
    }

    const user = await Model.findById(userId);
    if (!user) {
      console.log("[LOGOUT] User not found:", userId);
      return res
        .status(404)
        .json({ success: false, errors: ["User not found"] });
    }

    user.isLogin = false;
    user.currentDevice = null;
    await user.save();
    console.log("[LOGOUT] User logged out:", user._id);

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("[LOGOUT] Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
