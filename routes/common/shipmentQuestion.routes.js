const express = require("express");
const router = express.Router();

const controller = require("../../controllers/common/shipmentQuestion.controller");
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");

// ========================================================
// DEBUG HELPER
// ========================================================
const debugLog = (label, data) => {
  console.log(`\n========== ${label} ==========`);
  console.log(data);
  console.log("================================\n");
};

// ========================================================
// SHIPPER ROUTES
// ========================================================
router.post(
  "/ask",
  (req, res, next) => {
    debugLog("ASK ROUTE HIT", {
      body: req.body,
      headers: req.headers.authorization,
    });
    next();
  },
  shipperAuth,
  controller.askQuestion
);

// ========================================================
// CUSTOMER ROUTES
// ========================================================
router.post(
  "/answer",
  (req, res, next) => {
    debugLog("ANSWER ROUTE HIT", {
      body: req.body,
      headers: req.headers.authorization,
    });
    next();
  },
  customerAuth,
  controller.answerQuestion
);

// ========================================================
// SAFE ROLE CHECK MIDDLEWARE
// ========================================================
const allowCustomerOrShipper = async (req, res, next) => {
  console.log("===== AUTH CHECK START =====");

  try {
    // Try shipper FIRST
    try {
      await new Promise((resolve, reject) =>
        shipperAuth(req, res, (err) => (err ? reject(err) : resolve()))
      );

      req.user.role = "shipper";
      console.log("Authenticated as SHIPPER");
      return next();
    } catch (shipperErr) {
      console.log("Shipper auth failed");
    }

    // Try customer
    try {
      await new Promise((resolve, reject) =>
        customerAuth(req, res, (err) => (err ? reject(err) : resolve()))
      );

      req.user.role = "customer";
      console.log("Authenticated as CUSTOMER");
      return next();
    } catch (customerErr) {
      console.log("Customer auth failed");
    }

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  } catch (error) {
    console.log("Auth middleware crash:", error);
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
};

// ========================================================
// GET QUESTIONS
// ========================================================
router.get(
  "/:shipmentId",
  allowCustomerOrShipper,
  controller.getShipmentQuestions
);

module.exports = router;
