const express = require("express");
const router = express.Router();

const adminAuth = require("../../../middleware/admin/adminAuth");
const stripeAdminController = require("../../../controllers/admin/Payments/stripeAdminController");
const {
  stripeAdminAuditMiddleware,
} = require("../../../utils/stripeAdminAuditLogger");

router.use(adminAuth, stripeAdminAuditMiddleware);

// Stripe balance details
router.get("/balance", stripeAdminController.getStripeBalance);

// Platform funds available for client bank transfer
router.get(
  "/transfer-availability",
  stripeAdminController.getTransferAvailability
);

// Stripe recent transactions
router.get(
  "/transactions",
  stripeAdminController.getStripeTransactions
);


// Get Stripe Product & Subscription Prices
router.get(
  "/subscription-products",
  stripeAdminController.getSubscriptionProduct
);

router.post(
    "/subscription-price",
    stripeAdminController.createSubscriptionPrice
);

router.put(
    "/subscription-price/:priceId",
    stripeAdminController.updateSubscriptionPrice
);

router.patch(
    "/subscription-price/:priceId/deactivate",
    stripeAdminController.deactivateSubscriptionPrice
);
module.exports = router;
