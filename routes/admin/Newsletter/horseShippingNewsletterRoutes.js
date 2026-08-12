const express = require("express");
const router = express.Router();

const {
  getAllSubscribers,
  deleteSubscriber,
} = require("../../../controllers/horseShippingNewsletterController");
const adminAuth = require("../../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../../middleware/admin/permissionMiddleware");
const canAccessNewsletter = requireAdminPermission("newsletter:subscribers");

// Get all subscribers (Admin only)
router.get("/subscribers", adminAuth, canAccessNewsletter, getAllSubscribers);

// Delete a subscriber by ID (Admin only)
router.delete("/subscribers/:id", adminAuth, canAccessNewsletter, deleteSubscriber);

module.exports = router;
