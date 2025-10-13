const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

// Select model by role
const getModel = (role) => {
  if (role === "shipper") return Shipper;
  if (role === "customer") return Customer;
  return null;
};

// ---------------- Email/Password Signup ----------------
exports.signup = async (req, res) => {
  try {
    const { role, email, password, name, profilePicture } = req.body;
    if (!role || !email || !password)
      return res.status(400).json({
        success: false,
        errors: ["Role, email, and password are required"],
      });

    const Model = getModel(role);
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const existingUser = await Model.findOne({ email });
    if (existingUser)
      return res
        .status(409)
        .json({ success: false, errors: ["Email already registered"] });

    const user = new Model({
      name: name || email.split("@")[0],
      email,
      password,
      role,
      profilePicture: profilePicture || null,
      provider: "local",
      isLogin: false,
      isActive: true,
      loginHistory: [],
    });

    await user.save();
    const token = generateToken({ id: user._id, role: user.role });

    res
      .status(201)
      .json({ success: true, data: { ...user.toObject(), token } });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ---------------- Email/Password Login ----------------
exports.login = async (req, res) => {
  try {
    const { role, email, password, deviceId } = req.body;
    if (!role || !email || !password)
      return res.status(400).json({
        success: false,
        errors: ["Role, email, and password are required"],
      });

    const Model = getModel(role);
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const user = await Model.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res
        .status(401)
        .json({ success: false, errors: ["Invalid credentials"] });

    if (!user.isActive)
      return res
        .status(403)
        .json({ success: false, errors: ["Account is blocked"] });

    user.isLogin = true;
    user.currentDevice = deviceId || null;
    user.loginHistory.push({
      deviceId: deviceId || null,
      ip: req.ip,
      loginAt: new Date(),
    });

    await user.save();

    const token = generateToken({ id: user._id, role: user.role });
    res
      .status(200)
      .json({ success: true, data: { ...user.toObject(), token } });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ---------------- Google OAuth Login/Signup ----------------
exports.googleLogin = async (req, res) => {
  try {
    const { profile, role, deviceId } = req.body;
    if (!role || !profile)
      return res
        .status(400)
        .json({ success: false, errors: ["Role and profile are required"] });

    const Model = getModel(role);
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    let user = await Model.findOne({
      providerId: profile.id,
      provider: "google",
    });

    if (!user) {
      const email = profile.email || `${profile.id}@google.fake`;
      const name = profile.name || email.split("@")[0];

      user = await Model.create({
        name,
        email,
        provider: "google",
        providerId: profile.id,
        role,
        profilePicture: profile.picture || null,
        firstName: profile.firstName || null,
        lastName: profile.lastName || null,
        locale: profile.locale || null,
        emailVerified: profile.emailVerified || false,
        rawProfile: profile,
        isLogin: false,
        isActive: true,
        loginHistory: [],
      });
    }

    if (!user.isActive)
      return res
        .status(403)
        .json({ success: false, errors: ["Account is blocked"] });

    user.isLogin = true;
    user.currentDevice = deviceId || null;
    user.loginHistory.push({
      deviceId: deviceId || null,
      ip: req.ip,
      loginAt: new Date(),
    });

    if (profile.picture && profile.picture !== user.profilePicture)
      user.profilePicture = profile.picture;

    await user.save();

    const token = generateToken({ id: user._id, role: user.role });
    res
      .status(200)
      .json({ success: true, data: { ...user.toObject(), token } });
  } catch (err) {
    console.error("Google OAuth Error:", err);
    res
      .status(500)
      .json({ success: false, errors: ["Google OAuth login failed"] });
  }
};

// ---------------- Logout ----------------
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
    console.error("Logout Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
