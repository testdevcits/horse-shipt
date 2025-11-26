const bcrypt = require("bcryptjs");
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

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
    const num = Math.floor(1000 + Math.random() * 9000);
    id = `${prefix}${num}`;
    exists = await Model.findOne({ uniqueId: id });
  }

  return id;
};

// ======================================================
// SIGNUP
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

    // Prevent same email across both roles
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

    // ------------------------------
    // LOCAL Signup (NO Provider sent)
    // ------------------------------
    if (!provider || provider === "local") {
      if (!password)
        return res
          .status(400)
          .json({ success: false, errors: ["Password is required"] });

      userData.password = password.trim();
    }

    // ------------------------------
    // GOOGLE Signup
    // ------------------------------
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

    const token = generateToken({ id: user._id, role: user.role });

    res
      .status(201)
      .json({ success: true, data: { ...user.toObject(), token } });
  } catch (err) {
    console.error("[SIGNUP ERROR]:", err);
    return res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};

// ======================================================
// LOGIN
// ======================================================
exports.login = async (req, res) => {
  try {
    console.log("🔐 [LOGIN] Incoming request:", req.body);

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
      return res.status(400).json({ success: false, errors: ["Invalid role"] });
    }

    let user;

    // -------------------------
    // GOOGLE Login
    // -------------------------
    if (provider === "google" && profile) {
      user = await Model.findOne({
        email,
        providerId: profile.sub,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          errors: ["Google user not found. Please signup first."],
        });
      }
    } else {
      // -------------------------
      // LOCAL Login
      // -------------------------
      user = await Model.findOne({ email });

      if (!user) {
        return res
          .status(401)
          .json({ success: false, errors: ["Invalid credentials"] });
      }

      if (!user.emailVerified) {
        return res
          .status(403)
          .json({ success: false, errors: ["Email not verified"] });
      }

      if (!password) {
        return res
          .status(400)
          .json({ success: false, errors: ["Password required"] });
      }

      console.log("🔍 Plain password:", password);
      console.log("🔍 Hashed password:", user.password);

      const isMatch = await bcrypt.compare(password.trim(), user.password);

      console.log("🔍 bcrypt result:", isMatch);

      if (!isMatch) {
        return res
          .status(401)
          .json({ success: false, errors: ["Invalid credentials"] });
      }

      if (!user.isActive) {
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

    const token = generateToken({ id: user._id, role: user.role });

    return res.status(200).json({
      success: true,
      data: { ...user.toObject(), token },
    });
  } catch (err) {
    console.error("🔥 [LOGIN ERROR]:", err);
    return res.status(500).json({ success: false, errors: ["Server Error"] });
  }
};
