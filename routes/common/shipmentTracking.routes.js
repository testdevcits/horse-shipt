const { apiResponse } = require("../../responses/api.response");
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const controller = require("../../controllers/common/shipmentTracking.controller");

const Shipper = require("../../models/shipper/shipperModel");
const Customer = require("../../models/customer/customerModel");
const Driver = require("../../models/shipper/Driver");

// ========================================================
// COMMON AUTH (Driver / Shipper / Customer)
// ========================================================
const allowAllRoles = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // ================= TOKEN CHECK =================
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: apiResponse.UNAUTHORIZED_TOKEN_MISSING,
      });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: apiResponse.INVALID_OR_EXPIRED_TOKEN,
      });
    }

    // ================= DRIVER =================
    const driver = await Driver.findById(decoded.id);

    if (driver && driver.isActive) {
      req.user = driver;
      req.user.role = "driver";
      return next();
    }

    // ================= SHIPPER =================
    const shipper = await Shipper.findById(decoded.id);

    if (shipper && shipper.isActive) {
      req.user = shipper;
      req.user.role = "shipper";
      return next();
    }

    // ================= CUSTOMER =================
    const customer = await Customer.findById(decoded.id);

    if (customer && customer.isActive) {
      req.user = customer;
      req.user.role = "customer";
      return next();
    }

    // ================= NOT FOUND =================
    return res.status(404).json({
      success: false,
      message: apiResponse.USER_NOT_FOUND_OR_INACTIVE,
    });
  } catch (err) {
    console.error("[AUTH ERROR]", err);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_IN_AUTHENTICATION,
    });
  }
};

// ========================================================
// TRACK SHIPMENT (ALL ROLES)
// ========================================================
router.get("/track/:quoteId", allowAllRoles, controller.trackShipment);

module.exports = router;
