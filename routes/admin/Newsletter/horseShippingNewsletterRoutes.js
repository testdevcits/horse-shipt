const express = require("express");
const router = express.Router();

const {
  getAllSubscribers,
  deleteSubscriber,
} = require("../../../controllers/horseShippingNewsletterController");
const adminAuth = require("../middleware/admin/adminAuth");

// Get all subscribers (Admin only)
router.get("/subscribers", adminAuth, getAllSubscribers);

// Delete a subscriber by ID (Admin only)
router.delete("/subscribers/:id", adminAuth, deleteSubscriber);

module.exports = router;
