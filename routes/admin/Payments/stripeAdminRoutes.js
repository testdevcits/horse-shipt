const express = require("express");
const router = express.Router();

const adminAuth = require("../../../middleware/admin/adminAuth");
const stripeAdminController = require("../../../controllers/admin/Payments/stripeAdminController");
const {
  stripeAdminAuditMiddleware,
} = require("../../../utils/stripeAdminAuditLogger");
const { requireAdminPermission } = require("../../../middleware/admin/permissionMiddleware");
const canAccessStripePayments = requireAdminPermission("platform:stripe_payments");
const canManageSubscriptions = requireAdminPermission("platform:subscriptions");

router.use(adminAuth, stripeAdminAuditMiddleware);

// Stripe balance details
router.get("/balance", canAccessStripePayments, stripeAdminController.getStripeBalance);

// Platform funds available for client bank transfer
router.get(
  "/transfer-availability",
  canAccessStripePayments,
  stripeAdminController.getTransferAvailability
);

// Stripe recent transactions
router.get(
  "/transactions",
  canAccessStripePayments,
  stripeAdminController.getStripeTransactions
);


// Get Stripe Product & Subscription Prices
router.get(
  "/subscription-products",
  canManageSubscriptions,
  stripeAdminController.getSubscriptionProduct
);

router.post(
    "/subscription-price",
    canManageSubscriptions,
    stripeAdminController.createSubscriptionPrice
);

router.put(
    "/subscription-price/:priceId",
    canManageSubscriptions,
    stripeAdminController.updateSubscriptionPrice
);

router.patch(
    "/subscription-price/:priceId/deactivate",
    canManageSubscriptions,
    stripeAdminController.deactivateSubscriptionPrice
);
module.exports = router;
