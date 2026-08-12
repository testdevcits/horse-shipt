const { apiResponse } = require("../../responses/api.response");
const HorseAdmin = require("../../models/admin/Admin");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { baseTemplate, escapeHtml } = require("../../utils/mailTemplates/baseTemplate");

// ===============================
//  JWT GENERATOR
// ===============================
const generateToken = (admin) => {
  return jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

const isSixDigitOtp = (otp) => /^\d{6}$/.test(String(otp || ""));

// ===============================
//  EMAIL / SMTP SETUP
// ===============================
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_PORT == 465,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const normalizeEmail = (email = "") => email.toLowerCase().trim();

const serializeAdmin = (admin) => ({
  id: admin._id,
  _id: admin._id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  isActive: admin.isActive,
  lastLogin: admin.lastLogin || null,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

const isSuperAdmin = (req) => req.admin?.role === "super-admin";

const ensureSuperAdmin = (req, res) => {
  if (isSuperAdmin(req)) return true;

  res.status(403).json({
    success: false,
    message: "Only super admins can manage admin users.",
  });
  return false;
};

const validateAdminRole = (role) => ["admin", "super-admin"].includes(role);

const countActiveSuperAdminsExcluding = async (adminId) =>
  HorseAdmin.countDocuments({
    _id: { $ne: adminId },
    role: "super-admin",
    isActive: true,
  });

// =================================================
//  ADMIN SIGNUP
// =================================================
exports.signupAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const existingAdmins = await HorseAdmin.countDocuments();

    if (existingAdmins > 0) {
      return res.status(403).json({
        success: false,
        message: "Admin signup is disabled. Ask a super admin to add this account.",
      });
    }

    const exists = await HorseAdmin.findOne({ email: normalizeEmail(email) });
    if (exists)
      return res
        .status(400)
        .json({ success: false, message: apiResponse.ADMIN_ALREADY_EXISTS });

    const admin = await HorseAdmin.create({
      name,
      email: normalizeEmail(email),
      password,
      role: "super-admin",
    });
    const token = generateToken(admin);

    res.status(201).json({
      success: true,
      message: apiResponse.ADMIN_CREATED_SUCCESSFULLY,
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  ADMIN LOGIN
// =================================================
exports.loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await HorseAdmin.findOne({ email: normalizeEmail(email) }).select(
      "+password"
    );
    if (!admin)
      return res
        .status(401)
        .json({ success: false, message: apiResponse.INVALID_EMAIL_OR_PASSWORD });

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "This admin account is inactive.",
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: apiResponse.INVALID_EMAIL_OR_PASSWORD });

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);

    res.status(200).json({
      success: true,
      message: apiResponse.LOGIN_SUCCESSFUL,
      token,
      admin: {
        id: admin._id,
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  FORGOT PASSWORD (SEND OTP)
// =================================================
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const admin = await HorseAdmin.findOne({ email });
    if (!admin)
      return res
        .status(404)
        .json({ success: false, message: apiResponse.ADMIN_NOT_FOUND });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.otp = crypto.createHash("sha256").update(otp).digest("hex");
    admin.otpExpire = Date.now() + 5 * 60 * 1000; // 5 minutes
    await admin.save();

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: admin.email,
      subject: "Password Reset OTP",
      html: baseTemplate({
        title: "Password Reset OTP",
        preheader: "Use this one-time code to reset your admin password.",
        body: `
          <p style="margin:0 0 12px;">Use this one-time code to reset your admin password.</p>
          <div style="display:inline-block;margin:16px 0 8px;padding:14px 20px;background:#fff8ea;border:1px dashed #BF9B53;color:#BF9B53;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;">${escapeHtml(otp)}</div>
          <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">This OTP is valid for 5 minutes.</p>
        `,
        note: "If you did not request this, you can safely ignore this email.",
      }),
    });

    res
      .status(200)
      .json({ success: true, message: apiResponse.OTP_SENT_TO_REGISTERED_EMAIL });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  VERIFY OTP (NEW ENDPOINT)
// =================================================
exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!isSixDigitOtp(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 6 digits",
      });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    const admin = await HorseAdmin.findOne({
      email,
      otp: hashedOtp,
      otpExpire: { $gt: Date.now() },
    });
    if (!admin)
      return res
        .status(400)
        .json({ success: false, message: apiResponse.INVALID_OR_EXPIRED_OTP });

    res
      .status(200)
      .json({ success: true, message: apiResponse.OTP_VERIFIED_SUCCESSFULLY });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  RESET PASSWORD USING OTP
// =================================================
exports.resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: apiResponse.EMAIL_OTP_AND_NEW_PASSWORD_ARE_REQUIRED,
      });
    }

    if (!isSixDigitOtp(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 6 digits",
      });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    const admin = await HorseAdmin.findOne({
      email,
      otp: hashedOtp,
      otpExpire: { $gt: Date.now() },
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: apiResponse.INVALID_OR_EXPIRED_OTP,
      });
    }

    admin.password = newPassword; // hashed automatically in model
    admin.clearOtp();

    await admin.save();

    res.status(200).json({
      success: true,
      message: apiResponse.PASSWORD_RESET_SUCCESSFUL,
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  CHANGE PASSWORD
// =================================================
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await HorseAdmin.findById(req.admin.id).select("+password");

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: apiResponse.CURRENT_PASSWORD_IS_INCORRECT });

    admin.password = newPassword;
    await admin.save();

    res
      .status(200)
      .json({ success: true, message: apiResponse.PASSWORD_UPDATED_SUCCESSFULLY });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  GET ADMIN PROFILE
// =================================================
exports.getAdminProfile = async (req, res, next) => {
  try {
    const admin = await HorseAdmin.findById(req.admin.id);
    res.status(200).json({ success: true, admin: serializeAdmin(admin) });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  LIST ADMIN USERS
// =================================================
exports.listAdmins = async (req, res, next) => {
  try {
    if (!ensureSuperAdmin(req, res)) return;

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;

    const [admins, total] = await Promise.all([
      HorseAdmin.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      HorseAdmin.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: admins.map(serializeAdmin),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  CREATE ADMIN USER
// =================================================
exports.createAdminUser = async (req, res, next) => {
  try {
    if (!ensureSuperAdmin(req, res)) return;

    const { name, email, password, role = "admin" } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    if (!validateAdminRole(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin role.",
      });
    }

    const exists = await HorseAdmin.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: apiResponse.ADMIN_ALREADY_EXISTS,
      });
    }

    const admin = await HorseAdmin.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Admin user created successfully.",
      admin: serializeAdmin(admin),
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  UPDATE ADMIN USER
// =================================================
exports.updateAdminUser = async (req, res, next) => {
  try {
    if (!ensureSuperAdmin(req, res)) return;

    const { id } = req.params;
    const { name, email, role, password } = req.body;
    const admin = await HorseAdmin.findById(id).select("+password");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: apiResponse.ADMIN_NOT_FOUND,
      });
    }

    if (role && !validateAdminRole(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin role.",
      });
    }

    if (
      admin._id.toString() === req.admin.id.toString() &&
      admin.role === "super-admin" &&
      role === "admin"
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot demote your own super-admin account.",
      });
    }

    if (admin.role === "super-admin" && role === "admin") {
      const remainingSuperAdmins = await countActiveSuperAdminsExcluding(admin._id);
      if (remainingSuperAdmins < 1) {
        return res.status(400).json({
          success: false,
          message: "At least one active super admin is required.",
        });
      }
    }

    if (email) {
      const normalizedEmail = normalizeEmail(email);
      const existing = await HorseAdmin.findOne({
        email: normalizedEmail,
        _id: { $ne: admin._id },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: apiResponse.EMAIL_IS_ALREADY_USED_BY_ANOTHER_ADMIN,
        });
      }

      admin.email = normalizedEmail;
    }

    if (name) admin.name = name.trim();
    if (role) admin.role = role;
    if (password) admin.password = password;

    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Admin user updated successfully.",
      admin: serializeAdmin(admin),
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  TOGGLE ADMIN STATUS
// =================================================
exports.toggleAdminStatus = async (req, res, next) => {
  try {
    if (!ensureSuperAdmin(req, res)) return;

    const { id } = req.params;
    const admin = await HorseAdmin.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: apiResponse.ADMIN_NOT_FOUND,
      });
    }

    if (admin._id.toString() === req.admin.id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own admin account.",
      });
    }

    if (admin.isActive && admin.role === "super-admin") {
      const remainingSuperAdmins = await countActiveSuperAdminsExcluding(admin._id);
      if (remainingSuperAdmins < 1) {
        return res.status(400).json({
          success: false,
          message: "At least one active super admin is required.",
        });
      }
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: `Admin user ${admin.isActive ? "activated" : "deactivated"} successfully.`,
      admin: serializeAdmin(admin),
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  DELETE ADMIN USER
// =================================================
exports.deleteAdminUser = async (req, res, next) => {
  try {
    if (!ensureSuperAdmin(req, res)) return;

    const { id } = req.params;
    const admin = await HorseAdmin.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: apiResponse.ADMIN_NOT_FOUND,
      });
    }

    if (admin._id.toString() === req.admin.id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own admin account.",
      });
    }

    if (admin.role === "super-admin" && admin.isActive) {
      const remainingSuperAdmins = await countActiveSuperAdminsExcluding(admin._id);
      if (remainingSuperAdmins < 1) {
        return res.status(400).json({
          success: false,
          message: "At least one active super admin is required.",
        });
      }
    }

    await admin.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Admin user deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  UPDATE ADMIN PROFILE
// =================================================
exports.updateAdminProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: apiResponse.NAME_AND_EMAIL_ARE_REQUIRED,
      });
    }

    const existing = await HorseAdmin.findOne({
      email: email.toLowerCase().trim(),
      _id: { $ne: req.admin.id },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: apiResponse.EMAIL_IS_ALREADY_USED_BY_ANOTHER_ADMIN,
      });
    }

    const admin = await HorseAdmin.findByIdAndUpdate(
      req.admin.id,
      {
        name: name.trim(),
        email: email.toLowerCase().trim(),
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: apiResponse.PROFILE_UPDATED_SUCCESSFULLY,
      admin,
    });
  } catch (error) {
    next(error);
  }
};

// =================================================
//  LOGOUT
// =================================================
exports.logoutAdmin = async (req, res) => {
  res.status(200).json({ success: true, message: apiResponse.LOGGED_OUT_SUCCESSFULLY });
};
