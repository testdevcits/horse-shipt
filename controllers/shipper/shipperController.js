const Shipper = require("../../models/shipper/shipperModel");
const ShipperPayment = require("../../models/shipper/ShipperPaymentModel");
const fs = require("fs");
const path = require("path");

// ----------------- Update Shipper Profile -----------------
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

    // Handle profile picture
    if (req.file) {
      if (user.profilePicture) {
        const oldPath = path.join(__dirname, "../../", user.profilePicture);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      user.profilePicture = `uploads/profilePictures/${req.file.filename}`;
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: user,
      message: "Shipper profile updated successfully",
    });
  } catch (err) {
    console.error("[SHIPPER PROFILE UPDATE] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Add or Update Payment Setup ----------------
exports.addOrUpdatePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { serviceName, pkLive, skLive } = req.body;

    if (!serviceName || !pkLive || !skLive) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    let payment = await ShipperPayment.findOne({ userId });

    if (payment) {
      // Update existing
      payment.serviceName = serviceName;
      payment.pkLive = pkLive;
      payment.skLive = skLive;
      payment.active = true; // auto-activate on update
      await payment.save();
    } else {
      // Create new
      payment = await ShipperPayment.create({
        userId,
        serviceName,
        pkLive,
        skLive,
        active: true,
      });
    }

    res.status(200).json({
      success: true,
      data: payment,
      message: "Payment setup saved successfully",
    });
  } catch (err) {
    console.error("[ADD/UPDATE PAYMENT] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Payment Setup for Logged-in User ----------------
exports.getPaymentByUser = async (req, res) => {
  try {
    const userId = req.user._id;

    const payment = await ShipperPayment.findOne({ userId });

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "No payment setup found" });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (err) {
    console.error("[GET PAYMENT] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get All Payments (Admin) ----------------
exports.getAllPayments = async (req, res) => {
  try {
    const payments = await ShipperPayment.find().populate(
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
    const { id } = req.params; // payment ID
    const payment = await ShipperPayment.findById(id);

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    payment.active = !payment.active; // toggle status
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
