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
    await customerAuth(req, res, async (err) => {
      if (!err && req.user) {
        req.user.role = "customer";
        return next();
      }

      await shipperAuth(req, res, async (err2) => {
        if (!err2 && req.user) {
          req.user.role = "shipper";
          return next();
        }

        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      });
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
