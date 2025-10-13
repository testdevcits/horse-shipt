const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");
const verifyAppleToken = require("../utils/verifyAppleToken");
const verifyFacebookToken = require("../utils/facebookOAuth");

// Error messages
const shipperErr = require("../utils/errorMessages/shipperError");
const customerErr = require("../utils/errorMessages/customerError");

// ---------------- Helper: select model & error messages ----------------
const getModelAndError = (role) => {
  if (role === "shipper") return { Model: Shipper, ERR: shipperErr };
  if (role === "customer") return { Model: Customer, ERR: customerErr };
  return null;
};

// ---------------- Email/Password Signup ----------------
exports.signup = async (req, res) => {
  try {
    const { role, email, password, name } = req.body;

    if (!role || !email || !password) {
      return res.status(400).json({
        success: false,
        errors: ["Role, email, and password are required"],
      });
    }

    const selection = getModelAndError(role);
    if (!selection)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const { Model, ERR } = selection;

    const existingUser = await Model.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        errors: [ERR.EMAIL_REGISTERED],
      });
    }

    const user = new Model({
      name: name || email.split("@")[0],
      email,
      password,
      role,
      isLogin: false,
      isActive: true,
      provider: "local",
    });
    await user.save();

    const token = generateToken({ id: user._id, role: user.role });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider,
        providerId: user.providerId || null,
        isLogin: user.isLogin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token,
      },
    });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ---------------- Email/Password Login ----------------
exports.login = async (req, res) => {
  try {
    const { role, email, password, deviceId } = req.body;

    if (!role || !email || !password) {
      return res.status(400).json({
        success: false,
        errors: ["Role, email, and password are required"],
      });
    }

    const selection = getModelAndError(role);
    if (!selection)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const { Model, ERR } = selection;
    const user = await Model.findOne({ email });

    if (!user || !(await user.matchPassword(password))) {
      return res
        .status(401)
        .json({ success: false, errors: [ERR.INVALID_CREDENTIALS] });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, errors: ["Account is blocked"] });
    }

    if (user.isLogin && user.currentDevice !== deviceId) {
      return res.status(403).json({
        success: false,
        errors: ["User already logged in on another device"],
      });
    }

    user.isLogin = true;
    user.currentDevice = deviceId || null;
    await user.save();

    const token = generateToken({ id: user._id, role: user.role });

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider,
        providerId: user.providerId || null,
        isLogin: user.isLogin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ---------------- OAuth Login / Signup ----------------
exports.oauthLogin = async (req, res) => {
  try {
    const { provider, profile, role, accessToken, idToken, deviceId } =
      req.body;

    if (!role || !provider) {
      return res.status(400).json({
        success: false,
        errors: ["Role and provider are required"],
      });
    }

    const selection = getModelAndError(role);
    if (!selection)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const { Model } = selection;

    // Get profile from provider
    let profileData = profile;
    if (provider === "apple") profileData = await verifyAppleToken(idToken);
    if (provider === "facebook")
      profileData = await verifyFacebookToken(accessToken);

    // Check if user exists
    let user = await Model.findOne({
      providerId: profileData.id || profileData.appleId,
      provider,
    });

    // If user does not exist, create new
    if (!user) {
      const email =
        profileData.email ||
        `${profileData.id || profileData.appleId}@${provider}.fake`;
      const name = profileData.name || email.split("@")[0];

      user = await Model.create({
        name,
        email,
        provider,
        providerId: profileData.id || profileData.appleId,
        role,
        profilePicture: profileData.picture || null,
        firstName: profileData.firstName || null,
        lastName: profileData.lastName || null,
        locale: profileData.locale || null,
        emailVerified: profileData.emailVerified || false,
        rawProfile: profileData,
        isLogin: false,
        isActive: true,
      });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, errors: ["Account is blocked"] });
    }

    if (user.isLogin && user.currentDevice !== deviceId) {
      return res.status(403).json({
        success: false,
        errors: ["User already logged in on another device"],
      });
    }

    user.isLogin = true;
    user.currentDevice = deviceId || null;
    await user.save();

    const token = generateToken({ id: user._id, role: user.role });

    // ✅ Return full user info including OAuth profile
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider,
        providerId: user.providerId,
        profilePicture: user.profilePicture,
        firstName: user.firstName,
        lastName: user.lastName,
        locale: user.locale,
        isLogin: user.isLogin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token,
      },
    });
  } catch (err) {
    console.error("OAuth Error:", err);
    res.status(500).json({ success: false, errors: ["OAuth login failed"] });
  }
};

// ---------------- Logout ----------------
exports.logout = async (req, res) => {
  try {
    const { role, userId } = req.body;

    const selection = getModelAndError(role);
    if (!selection)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const { Model } = selection;
    const user = await Model.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, errors: ["User not found"] });
    }

    user.isLogin = false;
    user.currentDevice = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error("Logout Error:", err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
