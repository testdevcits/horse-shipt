// controllers/authController.js
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
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit
    id = `${prefix}${randomNum}`;
    const existing = await Model.findOne({ uniqueId: id });
    if (!existing) exists = false;
  }
  return id;
};

// ----------------- Signup -----------------
exports.signup = async (req, res) => {
  try {
    const { role, email, password, name, provider, profilePicture, profile } =
      req.body;

    if (!role || !email)
      return res
        .status(400)
        .json({ success: false, errors: ["Role and email are required"] });

    const Model = getModel(role);
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const existingUser = await Model.findOne({ email });
    if (existingUser)
      return res
        .status(409)
        .json({ success: false, errors: ["Email already registered"] });

    const uniqueId = await generateUniqueId(role);

    const user = new Model({
      uniqueId,
      name: name || email.split("@")[0],
      email,
      password: provider === "google" ? null : password,
      role,
      provider: provider || "local",
      profilePicture: profilePicture || (profile ? profile.picture : null),
      providerId: profile ? profile.sub : null,
      firstName: profile ? profile.given_name : null,
      lastName: profile ? profile.family_name : null,
      locale: profile ? profile.locale : null,
      emailVerified: provider === "google",
      rawProfile: profile || null,
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

// ----------------- Login -----------------
exports.login = async (req, res) => {
  try {
    const { role, email, password, provider, profile, deviceId } = req.body;

    if (!role || !email)
      return res
        .status(400)
        .json({ success: false, errors: ["Role and email are required"] });

    const Model = getModel(role);
    if (!Model)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    let user;

    if (provider === "google" && profile) {
      user = await Model.findOne({
        email,
        provider: "google",
        providerId: profile.sub,
      });
      if (!user)
        return res.status(404).json({
          success: false,
          errors: ["Google user not found. Please signup first."],
        });
    } else {
      user = await Model.findOne({ email });
      if (!user || !(await user.matchPassword(password)))
        return res
          .status(401)
          .json({ success: false, errors: ["Invalid credentials"] });
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
    console.error("Logout Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
