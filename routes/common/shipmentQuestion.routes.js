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
// SAFE ROLE CHECK MIDDLEWARE
// ========================================================
const allowCustomerOrShipper = async (req, res, next) => {
  try {
    // Try Shipper
    try {
      await new Promise((resolve, reject) =>
        shipperAuth(req, res, (err) => (err ? reject(err) : resolve()))
      );
      req.user.role = "shipper";
      return next();
    } catch (shipperErr) {
      console.log("Shipper auth failed:", shipperErr?.message || shipperErr);
    }

    // Try Customer
    try {
      await new Promise((resolve, reject) =>
        customerAuth(req, res, (err) => (err ? reject(err) : resolve()))
      );
      req.user.role = "customer";
      return next();
    } catch (customerErr) {
      console.log("Customer auth failed:", customerErr?.message || customerErr);
    }

    return res.status(401).json({
      success: false,
      message: "Unauthorized: invalid or missing token for Shipper/Customer",
    });
  } catch (err) {
    console.error("allowCustomerOrShipper error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
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
