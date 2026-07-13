const express = require("express");
const router = express.Router();

const adminAuth = require("../../../middleware/admin/adminAuth");
const stripeAdminController = require("../../../controllers/admin/Payments/stripeAdminController");

// Stripe balance details
router.get("/balance", adminAuth, stripeAdminController.getStripeBalance);

// Platform funds available for client bank transfer
router.get(
  "/transfer-availability",
  adminAuth,
  stripeAdminController.getTransferAvailability
);

// Stripe recent transactions
router.get(
  "/transactions",
  adminAuth,
  stripeAdminController.getStripeTransactions
);

module.exports = router;
