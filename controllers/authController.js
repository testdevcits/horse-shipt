const bcrypt = require("bcryptjs");
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

// ------------------------------------------------------
// Helper: Role → Model
// ------------------------------------------------------
const getModel = (role) => {
  if (role === "shipper") return Shipper;
  if (role === "customer") return Customer;
  return null;
};

// ------------------------------------------------------
// Helper: Unique ID Generator
// ------------------------------------------------------
const generateUniqueId = async (role) => {
  const prefix = role === "shipper" ? "HS" : "HC";
  const Model = getModel(role);

  let id;
  let exists = true;

  while (exists) {
    const num = Math.floor(1000 + Math.random() * 9000);
    id = `${prefix}${num}`;
    exists = await Model.findOne({ uniqueId: id });
  }

  return id;
};

// ======================================================
// SIGNUP CONTROLLER
// ======================================================
exports.signup = async (req, res) => {
  try {
    console.log("[SIGNUP] Request:", req.body);

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
      return res
        .status(400)
        .json({ success: false, errors: ["Role and email are required"] });
    }

    const Model = getModel(role);
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    // ----------------------------------------------------------------
    // Prevent duplicated email across Customer + Shipper
    // ----------------------------------------------------------------
    const emailUsed =
      (await Customer.findOne({ email })) || (await Shipper.findOne({ email }));

    if (emailUsed)
      return res.status(409).json({
        success: false,
        errors: ["Email already registered with another account/role"],
      });

    const uniqueId = await generateUniqueId(role);

    let userData = {
      uniqueId,
      name: name || profile?.name || email.split("@")[0],
      email,
      role,
      provider: provider || "local",
      emailVerified: provider === "google",
      isLogin: provider === "google",
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

    // ----------------------------------------------------------------
    // LOCAL SIGNUP → Hash password
    // (Hashing is handled by schema pre-save hook)
    // ----------------------------------------------------------------
    if (provider === "local") {
      if (!password)
        return res
          .status(400)
          .json({ success: false, errors: ["Password is required"] });

      userData.password = password.trim(); // trimmed for safety
    }

    // ----------------------------------------------------------------
    // GOOGLE SIGNUP
    // ----------------------------------------------------------------
    if (provider === "google" && profile) {
      userData.providerId = profile.sub;
      userData.profilePicture = profile.picture || null;
      userData.firstName = profile.given_name || null;
      userData.lastName = profile.family_name || null;
      userData.locale = profile.locale || null;
      userData.rawProfile = profile;
    }

    const user = new Model(userData);
    await user.save();

    console.log("[SIGNUP] User Created:", user._id);

    const token = generateToken({ id: user._id, role: user.role });

    res.status(201).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("[SIGNUP ERROR]:", err);
    return res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ======================================================
// LOGIN CONTROLLER
// ======================================================
exports.login = async (req, res) => {
  try {
    console.log("[LOGIN] Request:", req.body);

    const { role, email, password, provider, profile, deviceId, location } =
      req.body;

    if (!role || !email || (!password && !provider)) {
      return res
        .status(400)
        .json({
          success: false,
          errors: ["Role, email and password are required"],
        });
    }

    const Model = getModel(role);
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    let user;

    // ----------------------------------------------------------
    // GOOGLE LOGIN
    // ----------------------------------------------------------
    if (provider === "google" && profile) {
      user = await Model.findOne({ email, providerId: profile.sub });

      if (!user)
        return res.status(404).json({
          success: false,
          errors: ["Google user not found. Please signup first."],
        });
    } else {
      // ----------------------------------------------------------
      // LOCAL LOGIN
      // ----------------------------------------------------------
      user = await Model.findOne({ email });
      if (!user)
        return res
          .status(401)
          .json({ success: false, errors: ["Invalid credentials"] });

      if (!user.emailVerified)
        return res
          .status(403)
          .json({ success: false, errors: ["Email not verified"] });

      // Clean password before compare
      const cleanPassword = password.trim();

      const isMatch = await user.matchPassword(cleanPassword);
      if (!isMatch)
        return res
          .status(401)
          .json({ success: false, errors: ["Invalid credentials"] });

      if (!user.isActive)
        return res
          .status(403)
          .json({ success: false, errors: ["Account is blocked"] });
    }

    // ----------------------------------------------------------
    // UPDATE LOGIN STATUS
    // ----------------------------------------------------------
    user.isLogin = true;
    user.currentDevice = deviceId || user.currentDevice;
    user.currentLocation = location || user.currentLocation;

    user.loginHistory.push({
      deviceId,
      ip: req.ip || null,
      loginAt: new Date(),
    });

    await user.save();

    console.log("[LOGIN] User Logged In:", user._id);

    const token = generateToken({ id: user._id, role: user.role });

    return res.status(200).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("[LOGIN ERROR]:", err);
    return res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ======================================================
// LOGOUT CONTROLLER
// ======================================================
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

    return res
      .status(200)
      .json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("[LOGOUT ERROR]:", err);
    return res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
