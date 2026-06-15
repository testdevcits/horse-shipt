const express = require("express");
const jwt = require("jsonwebtoken");

const Customer = require("../../models/customer/customerModel");
const Shipper = require("../../models/shipper/shipperModel");
const controller = require("../../controllers/common/quoteNegotiation.controller");

const router = express.Router();

const allowCustomerOrShipper = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token missing",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const [shipper, customer] = await Promise.all([
      Shipper.findById(decoded.id),
      Customer.findById(decoded.id),
    ]);

    if (shipper && shipper.isActive) {
      req.user = shipper;
      req.user.role = "shipper";
      return next();
    }

    if (customer && customer.isActive) {
      req.user = customer;
      req.user.role = "customer";
      return next();
    }

    return res.status(404).json({
      success: false,
      message: "User not found or inactive",
    });
  } catch (error) {
    console.error("Quote negotiation auth error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error in authentication",
    });
  }
};

router.get(
  "/quotes/:quoteId",
  allowCustomerOrShipper,
  controller.getQuoteNegotiations
);

router.post(
  "/quotes/:quoteId",
  allowCustomerOrShipper,
  controller.createNegotiation
);

router.patch(
  "/:negotiationId/accept",
  allowCustomerOrShipper,
  controller.acceptNegotiation
);

router.patch(
  "/:negotiationId/reject",
  allowCustomerOrShipper,
  controller.rejectNegotiation
);

module.exports = router;
