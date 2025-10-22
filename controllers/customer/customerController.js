const Customer = require("../../models/customer/customerModel");
const CustomerPayment = require("../../models/customer/CustomerPaymentModel");
const fs = require("fs");
const path = require("path");

// ------------------ Profile Update ------------------
exports.updateProfile = async (req, res) => {
  try {
    const user = req.user; // From customerAuth middleware
    const { firstName, lastName, locale } = req.body;

    // Merge firstName + lastName into name
    if (firstName || lastName) {
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }

    if (locale) user.locale = locale;

    // Handle profile picture
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

// ---------------- Add Payment Setup (One per user) ----------------
exports.addOrUpdatePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { pkLive, skLive } = req.body;

    if (!pkLive || !skLive) {
      return res
        .status(400)
        .json({ success: false, message: "PK_LIVE and SK_LIVE are required" });
    }

    // Check if user already has a payment setup
    const existingPayment = await CustomerPayment.findOne({ userId });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: "You already have a payment setup. You can only update it.",
        data: existingPayment,
      });
    }

    // Create new payment setup
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

// ---------------- Get Payment Setup for Logged-in Customer ----------------
exports.getPaymentByUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const payment = await CustomerPayment.findOne({ userId });

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "No payment setup found" });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (err) {
    console.error("[CUSTOMER GET PAYMENT] Error:", err);
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
    console.error("[CUSTOMER GET ALL PAYMENTS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Activate / Deactivate Payment ----------------
exports.togglePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await CustomerPayment.findById(id);

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
    console.error("[CUSTOMER TOGGLE PAYMENT STATUS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
