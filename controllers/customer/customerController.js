const Customer = require("../../models/customer/customerModel");
const CustomerPayment = require("../../models/customer/CustomerPaymentModel");
const fs = require("fs");
const path = require("path");
const sendCustomerPaymentEmail = require("../../utils/customerPaymentEmail");
const crypto = require("crypto");

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
      // Create temporary payment object to store OTP
      payment = new CustomerPayment({
        userId,
        serviceName: "Stripe",
        pkLive,
        skLive,
        lastOtpSentAt: new Date(),
        lastUpdatedByOtp: false,
      });
    }

    payment.otp = otp; // save OTP temporarily
    payment.lastOtpSentAt = new Date();
    await payment.save();

    // Send email with OTP
    await sendCustomerPaymentEmail(req.user.email, otp);

    res.status(200).json({
      success: true,
      message: "OTP sent to your email.",
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
    const { pkLive, skLive, otp } = req.body;

    // Log incoming request body for debugging
    console.log("[VERIFY OTP] Incoming Body:", req.body);

    if (!pkLive || !skLive || !otp) {
      console.log("[VERIFY OTP] Missing fields", { pkLive, skLive, otp });
      return res.status(400).json({
        success: false,
        message: "PK_LIVE, SK_LIVE, and OTP are required",
      });
    }

    const payment = await CustomerPayment.findOne({ userId });

    // Log the payment found in DB
    console.log("[VERIFY OTP] Payment in DB:", payment);

    if (!payment || payment.otp !== otp) {
      console.log("[VERIFY OTP] OTP mismatch", {
        providedOtp: otp,
        storedOtp: payment ? payment.otp : null,
      });
      return res.status(400).json({ success: false, message: "Invalid OTP" });
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
