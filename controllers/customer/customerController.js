const Customer = require("../../models/customer/customerModel");
const CustomerPayment = require("../../models/customer/CustomerPaymentModel");
const fs = require("fs");
const path = require("path");
const sendCustomerPaymentEmail = require("../../utils/customerPaymentEmail");

// ------------------ Profile Update ------------------
exports.updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { firstName, lastName, locale } = req.body;

    if (firstName || lastName) {
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }

    if (locale) user.locale = locale;

    if (req.file) {
      if (user.profilePicture) {
        const oldPath = path.join(__dirname, "../../", user.profilePicture);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      user.profilePicture = req.file.path;
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: user,
      message: "Customer profile updated successfully",
    });
  } catch (err) {
    console.error("[CUSTOMER PROFILE UPDATE] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Add Payment Setup (First time) ----------------
exports.addOrUpdatePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { pkLive, skLive } = req.body;

    if (!pkLive || !skLive) {
      return res.status(400).json({
        success: false,
        message: "PK_LIVE and SK_LIVE are required",
      });
    }

    const existingPayment = await CustomerPayment.findOne({ userId });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message:
          "Payment already exists. Use OTP verification to update payment.",
        data: existingPayment,
      });
    }

    const payment = await CustomerPayment.create({
      userId,
      serviceName: "Stripe",
      pkLive,
      skLive,
      active: true,
    });

    res.status(201).json({
      success: true,
      data: payment,
      message: "Payment setup created successfully",
    });
  } catch (err) {
    console.error("[CUSTOMER ADD PAYMENT] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Request OTP for Payment Update ----------------
exports.requestPaymentUpdateOTP = async (req, res) => {
  try {
    const userId = req.user._id;
    const { pkLive, skLive } = req.body;

    if (!pkLive || !skLive) {
      return res.status(400).json({
        success: false,
        message: "PK_LIVE and SK_LIVE are required",
      });
    }

    // Find existing payment setup
    const payment = await CustomerPayment.findOne({ userId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "No existing payment found. Please create payment first.",
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP in DB
    payment.otp = otp;
    payment.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
    payment.lastOtpSentAt = new Date();
    await payment.save();

    // Send OTP via email
    await sendCustomerPaymentEmail(
      req.user.email,
      "Payment Update OTP",
      `Your OTP is: ${otp}. It will expire in 5 minutes.`,
      `<p>Your OTP for updating payment is: <strong>${otp}</strong>. It will expire in 5 minutes.</p>`
    );

    res.status(200).json({
      success: true,
      message: "OTP sent to your email. Verify to update payment.",
    });
  } catch (err) {
    console.error("[REQUEST PAYMENT OTP] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Verify OTP & Update Payment ----------------
exports.verifyPaymentOTP = async (req, res) => {
  try {
    const userId = req.user._id;
    const { otp, pkLive, skLive } = req.body;

    const payment = await CustomerPayment.findOne({ userId });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    if (!payment.otp || !payment.otpExpiresAt) {
      return res
        .status(400)
        .json({ success: false, message: "No OTP requested" });
    }

    if (payment.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (new Date() > payment.otpExpiresAt) {
      payment.otp = null;
      payment.otpExpiresAt = null;
      await payment.save();
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    payment.pkLive = pkLive;
    payment.skLive = skLive;
    payment.lastUpdatedByOtp = true;
    payment.otp = null;
    payment.otpExpiresAt = null;

    await payment.save();

    res.status(200).json({
      success: true,
      data: payment,
      message: "Payment updated successfully",
    });
  } catch (err) {
    console.error("[VERIFY PAYMENT OTP] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Payment Setup for Logged-in Customer ----------------
exports.getPaymentByUser = async (req, res) => {
  try {
    const payment = await CustomerPayment.findOne({ userId: req.user._id });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "No payment setup found" });
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
