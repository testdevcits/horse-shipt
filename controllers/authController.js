const bcrypt = require("bcryptjs");
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const PendingSignup = require("../models/PendingSignup");
const generateToken = require("../utils/generateToken");
const { sendOtpMail } = require("../utils/mailService");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// ----------------- Utility Functions -----------------
const getModel = (role) => {
  if (role === "shipper") return Shipper;
  if (role === "customer") return Customer;
  return null;
};

const normalizeEmail = (email = "") => email.trim().toLowerCase();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const hashOtp = async (otp) => bcrypt.hash(otp, 10);

const createStripeCustomer = async (user) => {
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
  });

  user.stripeCustomerId = customer.id;
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

const hasExistingAccount = async (email) => {
  const [existingShipper, existingCustomer] = await Promise.all([
    Shipper.findOne({ email }),
    Customer.findOne({ email }),
  ]);

  return Boolean(existingShipper || existingCustomer);
};

const sendPendingSignupOtp = async (pending) => {
  const otp = generateOtp();

  pending.otpHash = await hashOtp(otp);
  pending.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  pending.attempts = 0;
  pending.lastSentAt = new Date();
  pending.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pending.save();
  await sendOtpMail(pending.email, otp);
};

const buildAuthResponse = (user) => {
  const token = generateToken({ id: user._id, role: user.role });
  return { ...user.toObject(), token };
};

// ----------------- Signup -----------------
exports.signup = async (req, res) => {
  try {
    const {
      role,
      email: rawEmail,
      password,
      name,
      provider = "local",
      profile,
      location,
      deviceId,
    } = req.body;

    if (!role || !rawEmail) {
      return res.status(400).json({
        success: false,
        errors: ["Role and email are required"],
      });
    }

    const email = normalizeEmail(rawEmail);

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    // ---------------- CHECK DUPLICATE EMAIL ----------------
    if (await hasExistingAccount(email)) {
      return res.status(409).json({
        success: false,
        errors: ["Email already registered with another account/role"],
      });
    }

    // Local signup must verify email before creating the real account.
    // Google OAuth signup remains unchanged and creates the account immediately.
    if (provider === "local") {
      if (!password) {
        return res.status(400).json({
          success: false,
          errors: ["Password is required"],
        });
      }

      const pending = await PendingSignup.findOne({ email, role });

      if (pending) {
        pending.name = name || email.split("@")[0];
        pending.password = password;
        pending.deviceId = deviceId || null;
        pending.currentLocation = location || null;

        await sendPendingSignupOtp(pending);
      } else {
        const nextPending = new PendingSignup({
          role,
          email,
          password,
          name: name || email.split("@")[0],
          deviceId: deviceId || null,
          currentLocation: location || null,
          otpHash: await hashOtp(generateOtp()),
          otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        await sendPendingSignupOtp(nextPending);
      }

      return res.status(202).json({
        success: true,
        requiresOtp: true,
        message: "OTP sent to your email. Verify it to create your account.",
        data: { email, role },
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
    await createStripeCustomer(user);

    await user.save();

    return res.status(201).json({
      success: true,
      data: buildAuthResponse(user),
    });
  } catch (err) {
    console.error("[SIGNUP ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- Verify Local Signup OTP -----------------
exports.verifySignupOtp = async (req, res) => {
  try {
    const { role, email: rawEmail, otp } = req.body;

    if (!role || !rawEmail || !otp) {
      return res.status(400).json({
        success: false,
        errors: ["Role, email and OTP are required"],
      });
    }

    const email = normalizeEmail(rawEmail);
    const Model = getModel(role);

    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    if (await hasExistingAccount(email)) {
      await PendingSignup.deleteMany({ email });
      return res.status(409).json({
        success: false,
        errors: ["Email already registered with another account/role"],
      });
    }

    const pending = await PendingSignup.findOne({ email, role });

    if (!pending) {
      return res.status(404).json({
        success: false,
        errors: ["Please start signup again"],
      });
    }

    if (pending.otpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        errors: ["OTP expired. Please resend OTP"],
      });
    }

    if (pending.attempts >= 5) {
      return res.status(429).json({
        success: false,
        errors: ["Too many invalid attempts. Please resend OTP"],
      });
    }

    const isOtpValid = await bcrypt.compare(String(otp).trim(), pending.otpHash);

    if (!isOtpValid) {
      pending.attempts += 1;
      await pending.save();

      return res.status(400).json({
        success: false,
        errors: ["Invalid OTP"],
      });
    }

    const user = new Model({
      uniqueId: await generateUniqueId(role),
      name: pending.name || email.split("@")[0],
      email,
      role,
      password: pending.password,
      provider: "local",
      emailVerified: true,
      isLogin: true,
      isActive: true,
      currentDevice: pending.deviceId || null,
      currentLocation: pending.currentLocation || undefined,
      loginHistory: [
        {
          deviceId: pending.deviceId || null,
          ip: req.ip,
          loginAt: new Date(),
        },
      ],
    });

    await createStripeCustomer(user);
    await user.save();
    await PendingSignup.deleteMany({ email });

    return res.status(201).json({
      success: true,
      message: "Email verified and account created",
      data: buildAuthResponse(user),
    });
  } catch (err) {
    console.error("[VERIFY SIGNUP OTP ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- Resend Local Signup OTP -----------------
exports.resendSignupOtp = async (req, res) => {
  try {
    const { role, email: rawEmail } = req.body;

    if (!role || !rawEmail) {
      return res.status(400).json({
        success: false,
        errors: ["Role and email are required"],
      });
    }

    const email = normalizeEmail(rawEmail);

    if (!getModel(role)) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    if (await hasExistingAccount(email)) {
      await PendingSignup.deleteMany({ email });
      return res.status(409).json({
        success: false,
        errors: ["Email already registered with another account/role"],
      });
    }

    const pending = await PendingSignup.findOne({ email, role });

    if (!pending) {
      return res.status(404).json({
        success: false,
        errors: ["Please start signup again"],
      });
    }

    await sendPendingSignupOtp(pending);

    return res.status(200).json({
      success: true,
      requiresOtp: true,
      message: "OTP resent to your email",
      data: { email, role },
    });
  } catch (err) {
    console.error("[RESEND SIGNUP OTP ERROR]", err);
    return res.status(500).json({
      success: false,
      errors: ["Server Error"],
    });
  }
};

// ----------------- Login -----------------
exports.login = async (req, res) => {
  try {
    const {
      role,
      email: rawEmail,
      password,
      provider,
      profile,
      deviceId,
      location,
    } = req.body;

    if (!role || !rawEmail) {
      return res.status(400).json({
        success: false,
        errors: ["Role and email are required"],
      });
    }

    const email = normalizeEmail(rawEmail);

    const Model = getModel(role);
    if (!Model) {
      return res.status(400).json({
        success: false,
        errors: ["Invalid role"],
      });
    }

    const user = await Model.findOne({ email });

    if (!user) {
      const pendingSignup = await PendingSignup.findOne({ email, role });
      if (pendingSignup) {
        await sendPendingSignupOtp(pendingSignup);
        return res.status(403).json({
          success: false,
          requiresOtp: true,
          message: "Email verification is pending. OTP resent to your email.",
          errors: ["Please verify your email to finish signup"],
          data: { email, role },
        });
      }

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
      return res
        .status(400)
        .json({ success: false, errors: ["Invalid roles"] });

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
