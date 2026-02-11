const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const controller = require("../../controllers/common/shipmentQuestion.controller");
const Shipper = require("../../models/shipper/shipperModel");
const Customer = require("../../models/customer/customerModel");

// ========================================================
// SHIPPER ROUTES
// ========================================================
router.post(
  "/ask",
  async (req, res, next) => {
    try {
      await shipperAuth(req, res, next);
    } catch (err) {
      console.error("Shipper ask route error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },
  controller.askQuestion
);

// ========================================================
// CUSTOMER ROUTES
// ========================================================
router.post(
  "/answer",
  async (req, res, next) => {
    try {
      await customerAuth(req, res, next);
    } catch (err) {
      console.error("Customer answer route error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },
  controller.answerQuestion
);

// ========================================================
// SAFE ROLE CHECK MIDDLEWARE (for GET /questions/:shipmentId)
// ========================================================
const allowCustomerOrShipper = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Missing or invalid token",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired token",
      });
    }

    // Try Shipper
    const shipper = await Shipper.findById(decoded.id);
    if (shipper && shipper.isActive) {
      req.user = shipper;
      req.user.role = "shipper";
      return next();
    }

    // Try Customer
    const customer = await Customer.findById(decoded.id);
    if (customer && customer.isActive) {
      req.user = customer;
      req.user.role = "customer";
      return next();
    }

    return res.status(404).json({
      success: false,
      message: "User not found or inactive",
    });
  } catch (err) {
    console.error("allowCustomerOrShipper error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ========================================================
// GET QUESTIONS (safe for Shipper & Customer)
// ========================================================
router.get(
  "/:shipmentId",
  allowCustomerOrShipper,
  controller.getShipmentQuestions
);

module.exports = router;

// ========================================================
// HELPER AUTH FUNCTIONS
// ========================================================
async function shipperAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await Shipper.findById(decoded.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Shipper not found" });
    if (!user.isActive)
      return res
        .status(403)
        .json({ success: false, message: "Account is blocked" });

    req.user = user;
    next();
  } catch (err) {
    console.error("shipperAuth error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

async function customerAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await Customer.findById(decoded.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    if (!user.isActive)
      return res
        .status(403)
        .json({ success: false, message: "Account is blocked" });

    req.user = user;
    next();
  } catch (err) {
    console.error("customerAuth error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
