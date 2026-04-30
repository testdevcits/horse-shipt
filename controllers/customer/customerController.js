const Customer = require("../../models/customer/customerModel");
const CustomerPayment = require("../../models/customer/CustomerPaymentModel");
const fs = require("fs");
const path = require("path");
const sendCustomerPaymentEmail = require("../../utils/customerPaymentEmail");
const crypto = require("crypto");

const cloudinary = require("cloudinary").v2;

// -----------------------------
// Cloudinary Configuration
// -----------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ------------------ Profile Update ------------------
exports.updateCustomerDetails = async (req, res) => {
  try {
    const customer = req.user;

    const { firstName, lastName, phone, locale } = req.body;

    // ----------------- NAME UPDATE -----------------
    if (firstName !== undefined) customer.firstName = firstName;
    if (lastName !== undefined) customer.lastName = lastName;

    if (firstName || lastName) {
      customer.name = `${customer.firstName || ""} ${
        customer.lastName || ""
      }`.trim();
    }

    // ----------------- PHONE UPDATE -----------------
    if (phone !== undefined) {
      let cleanedPhone = phone.toString().trim();

      // Keep leading +, remove spaces, dashes, parentheses and other separators.
      cleanedPhone = cleanedPhone.startsWith("+")
        ? `+${cleanedPhone.slice(1).replace(/\D/g, "")}`
        : cleanedPhone.replace(/\D/g, "");

      // Backward compatibility for older Indian-only UI payloads.
      if (/^\d{10}$/.test(cleanedPhone)) {
        cleanedPhone = `+91${cleanedPhone}`;
      }

      // validate final format (E.164)
      const phoneRegex = /^\+[1-9]\d{9,14}$/;

      if (!phoneRegex.test(cleanedPhone)) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format. Use valid number",
        });
      }

      customer.phone = cleanedPhone;
      customer.phoneVerified = false;
    }

    // ----------------- LOCALE UPDATE -----------------
    if (locale !== undefined) {
      customer.locale = locale;
    }

    await customer.save();

    res.status(200).json({
      success: true,
      message: "Profile details updated successfully",
      data: customer,
    });
  } catch (error) {
    console.error("Update Customer Details Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile details",
    });
  }
};

// ------------------ Add or Update Payment (Direct) ------------------
exports.addOrUpdatePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { pkLive, skLive, paymentId } = req.body;

    if (!pkLive || !skLive) {
      return res.status(400).json({
        success: false,
        message: "PK_LIVE and SK_LIVE are required",
      });
    }

    // Update existing payment
    if (paymentId) {
      const existingPayment = await CustomerPayment.findOne({
        _id: paymentId,
        userId,
      });

      if (!existingPayment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found for this ID",
        });
      }

      existingPayment.pkLive = pkLive;
      existingPayment.skLive = skLive;
      existingPayment.lastUpdatedByOtp = false;
      await existingPayment.save();

      return res.status(200).json({
        success: true,
        data: existingPayment,
        message: "Payment updated successfully",
      });
    }

    // Create new payment if not exists
    const existingPayment = await CustomerPayment.findOne({ userId });
    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: "Payment already exists. Use OTP to update.",
        data: existingPayment,
      });
    }

    const payment = await CustomerPayment.create({
      userId,
      serviceName: "Stripe",
      pkLive,
      skLive,
      active: true,
      lastUpdatedByOtp: false,
    });

    res.status(201).json({
      success: true,
      data: payment,
      message: "Payment setup created successfully",
    });
  } catch (err) {
    console.error("[CUSTOMER ADD/UPDATE PAYMENT] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Payment Setup for Logged-in Customer ----------------
exports.getPaymentByUser = async (req, res) => {
  try {
    const payment = await CustomerPayment.findOne({ userId: req.user._id });
    if (!payment) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No payment setup found",
      });
    }
    res.status(200).json({ success: true, data: payment });
  } catch (err) {
    console.error("[GET PAYMENT BY USER] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Payment by ID ----------------
exports.getPaymentById = async (req, res) => {
  try {
    const payment = await CustomerPayment.findById(req.params.id).populate(
      "userId",
      "name email"
    );
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }
    res.status(200).json({ success: true, data: payment });
  } catch (err) {
    console.error("[GET PAYMENT BY ID] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get All Payments (Admin) ----------------
exports.getAllPayments = async (req, res) => {
  try {
    const payments = await CustomerPayment.find().populate(
      "userId",
      "name email"
    );
    res.status(200).json({ success: true, data: payments });
  } catch (err) {
    console.error("[GET ALL PAYMENTS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Activate / Deactivate Payment ----------------
exports.togglePaymentStatus = async (req, res) => {
  try {
    const payment = await CustomerPayment.findById(req.params.id);
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }
    payment.active = !payment.active;
    await payment.save();
    res.status(200).json({
      success: true,
      data: payment,
      message: `Payment has been ${
        payment.active ? "activated" : "deactivated"
      }`,
    });
  } catch (err) {
    console.error("[TOGGLE PAYMENT STATUS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Request OTP for Payment ----------------
exports.requestOtp = async (req, res) => {
  try {
    const userId = req.user._id;
    const { pkLive, skLive } = req.body;

    if (!pkLive || !skLive) {
      return res.status(400).json({
        success: false,
        message: "PK_LIVE and SK_LIVE are required to request OTP",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    let payment = await CustomerPayment.findOne({ userId });

    if (!payment) {
      // Create new payment object
      payment = new CustomerPayment({
        userId,
        serviceName: "Stripe",
        pkLive,
        skLive,
        lastOtpSentAt: new Date(),
        lastUpdatedByOtp: false,
      });
    } else {
      // Update pkLive/skLive for existing payment
      payment.pkLive = pkLive;
      payment.skLive = skLive;
    }

    payment.otp = otp; // save OTP temporarily
    payment.lastOtpSentAt = new Date();
    await payment.save();

    // Send email with OTP
    await sendCustomerPaymentEmail(
      req.user.email,
      "Your OTP for Stripe Payment",
      `Your OTP is: ${otp}`
    );

    res.status(200).json({
      success: true,
      message: "OTP sent to your email.",
      paymentId: payment._id, // send paymentId so frontend can verify OTP
    });
  } catch (err) {
    console.error("[REQUEST OTP] Error:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// ---------------- Verify OTP & Save Payment ----------------
exports.verifyOtp = async (req, res) => {
  try {
    const userId = req.user._id;
    const { paymentId, pkLive, skLive, otp } = req.body;

    console.log("[VERIFY OTP] Incoming Body:", req.body);

    if (!paymentId || !pkLive || !skLive || !otp) {
      return res.status(400).json({
        success: false,
        message: "Payment ID, PK_LIVE, SK_LIVE, and OTP are required",
      });
    }

    // Trim OTP in case user adds spaces
    const trimmedOtp = otp.toString().trim();

    // Find payment by ID and userId
    const payment = await CustomerPayment.findOne({ _id: paymentId, userId });

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    // Check OTP match
    if (!payment.otp || payment.otp !== trimmedOtp) {
      console.log("[VERIFY OTP] OTP mismatch", {
        providedOtp: trimmedOtp,
        storedOtp: payment.otp,
      });
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // Optional: check OTP expiration (e.g., 10 minutes)
    const otpAge = (new Date() - payment.lastOtpSentAt) / 1000; // in seconds
    if (otpAge > 600) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // Save payment
    payment.pkLive = pkLive;
    payment.skLive = skLive;
    payment.lastUpdatedByOtp = true;
    payment.otp = null; // clear OTP
    await payment.save();

    console.log("[VERIFY OTP] Payment updated successfully", payment);

    res.status(200).json({
      success: true,
      data: payment,
      message: "Payment saved successfully via OTP",
    });
  } catch (err) {
    console.error("[VERIFY OTP] Error:", err);
    res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
};

// -------------------------
// Update Customer Profile Image
// -------------------------
exports.updateCustomerProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const customer = req.user; // already authenticated

    // Delete old image from Cloudinary if exists
    if (customer.profileImage?.public_id) {
      await cloudinary.uploader.destroy(customer.profileImage.public_id);
    }

    // Upload new image
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "customerProfileImages",
      overwrite: true,
    });

    customer.profileImage = {
      url: result.secure_url,
      public_id: result.public_id,
    };

    await customer.save();

    res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      profileImage: customer.profileImage,
    });
  } catch (error) {
    console.error("Update Customer Profile Image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload profile image",
    });
  }
};

// ===================================================
// Get Customer Profile
// ===================================================
exports.getCustomerProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.id)
      .select(
        "uniqueId name email role firstName lastName locale emailVerified " +
          "profileImage profilePicture bannerImage currentLocation isLogin " +
          "phone phoneVerified"
      )
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // ================================
    // Profile Image Resolution Priority
    // ================================
    const resolvedProfileImage =
      customer.profileImage?.url ||
      customer.profilePicture ||
      "/images/default_profile.png";

    // ================================
    // Banner Image Resolution
    // ================================
    const resolvedBannerImage =
      customer.bannerImage?.url || "/images/default_banner.png";

    res.status(200).json({
      success: true,
      message: "Customer profile fetched successfully",
      data: {
        uniqueId: customer.uniqueId,
        name: customer.name,
        email: customer.email,
        role: customer.role,
        firstName: customer.firstName,
        lastName: customer.lastName,
        locale: customer.locale || "",
        emailVerified: customer.emailVerified,

        // NEW FIELDS
        phone: customer.phone || null,
        phoneVerified: customer.phoneVerified || false,

        currentLocation: customer.currentLocation || null,
        isLogin: customer.isLogin,
        profileImage: resolvedProfileImage,
        bannerImage: resolvedBannerImage,
      },
    });
  } catch (error) {
    console.error("Get Customer Profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customer profile",
    });
  }
};
