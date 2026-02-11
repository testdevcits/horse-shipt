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
  debugLog("GET QUESTIONS HIT", {
    shipmentId: req.params.shipmentId,
    token: req.headers.authorization,
  });

  const token = req.headers.authorization;

  if (!token) {
    console.log("No token provided");
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  // ===== TRY CUSTOMER =====
  customerAuth(req, res, (err) => {
    if (!err && req.user) {
      console.log("Authenticated as CUSTOMER");
      req.user.role = "customer";
      return next();
    }

    console.log("Customer auth failed, trying shipper...");

    // ===== TRY SHIPPER =====
    shipperAuth(req, res, (err2) => {
      if (!err2 && req.user) {
        console.log("Authenticated as SHIPPER");
        req.user.role = "shipper";
        return next();
      }

      console.log("Both auth failed");

      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    });
  });
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
