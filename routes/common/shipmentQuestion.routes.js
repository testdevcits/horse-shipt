const express = require("express");
const router = express.Router();

const controller = require("../../controllers/common/shipmentQuestion.controller");
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");

// ========================================================
// SHIPPER ROUTES
// ========================================================
router.post("/ask", shipperAuth, controller.askQuestion);

// ========================================================
// CUSTOMER ROUTES
// ========================================================
router.post("/answer", customerAuth, controller.answerQuestion);

// ========================================================
// GET QUESTIONS (COMMON)
// ========================================================

//Custom middleware to allow both roles
const allowCustomerOrShipper = async (req, res, next) => {
  try {
    // 🔹 Try customer first
    try {
      await new Promise((resolve, reject) =>
        customerAuth(req, res, (err) => (err ? reject(err) : resolve()))
      );
      req.user.role = "customer";
      return next();
    } catch (_) {}

    // 🔹 Try shipper
    try {
      await new Promise((resolve, reject) =>
        shipperAuth(req, res, (err) => (err ? reject(err) : resolve()))
      );
      req.user.role = "shipper";
      return next();
    } catch (_) {}

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
};

router.get(
  "/:shipmentId",
  allowCustomerOrShipper,
  controller.getShipmentQuestions
);

module.exports = router;
