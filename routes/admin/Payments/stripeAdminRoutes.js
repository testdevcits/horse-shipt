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


// Get Stripe Product & Subscription Prices
router.get(
  "/subscription-products",
  adminAuth,
  stripeAdminController.getSubscriptionProduct
);

router.post(
    "/subscription-price",
    adminAuth,
    stripeAdminController.createSubscriptionPrice
);

router.put(
    "/subscription-price/:priceId",
    adminAuth,
    stripeAdminController.updateSubscriptionPrice
);
module.exports = router;
