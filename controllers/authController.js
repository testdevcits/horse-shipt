const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");
const verifyAppleToken = require("../utils/verifyAppleToken");
const verifyFacebookToken = require("../utils/facebookOAuth");

const shipperErr = require("../utils/errorMessages/shipperError");
const customerErr = require("../utils/errorMessages/customerError");

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

    // Check if user exists
    const existingUser = await Model.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, errors: [ERR.EMAIL_REGISTERED] });
    }

    // Create user
    const user = new Model({
      name: name || email.split("@")[0],
      email,
      password,
      role, // explicitly set role
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
        provider: user.provider || "local",
        providerId: user.providerId || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ---------------- Email/Password Login ----------------
exports.login = async (req, res) => {
  try {
    const { role, email, password } = req.body;

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

    const token = generateToken({ id: user._id, role: user.role });

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider || "local",
        providerId: user.providerId || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ---------------- OAuth Login / Signup ----------------
exports.oauthLogin = async (req, res) => {
  try {
    const { provider, profile, role, accessToken, idToken } = req.body;

    if (!role || !provider) {
      return res
        .status(400)
        .json({ success: false, errors: ["Role and provider are required"] });
    }

    const selection = getModelAndError(role);
    if (!selection)
      return res.status(400).json({ success: false, errors: ["Invalid role"] });

    const { Model } = selection;

    // Get profile data from provider
    let profileData = profile;
    if (provider === "apple") profileData = await verifyAppleToken(idToken);
    if (provider === "facebook")
      profileData = await verifyFacebookToken(accessToken);

    // Check if user exists
    let user = await Model.findOne({
      providerId: profileData.id || profileData.appleId,
      provider,
    });

    // If user does not exist, create one
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
      });
    }

    const token = generateToken({ id: user._id, role: user.role });

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider,
        providerId: user.providerId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
