const express = require("express");
const router = express.Router();

const {
  subscribeNewsletter,
  verifyEmail,
  getAllSubscribers,
  deleteSubscriber,
  sendNewsletter,
} = require("../controllers/horseShippingNewsletterController");
const adminAuth = require("../middleware/admin/adminAuth");

// ------------------- Public Routes ------------------- //
// Subscribe (user enters email)
router.post("/subscribe", subscribeNewsletter);

// Verify Email (via email link)
router.get("/verify", verifyEmail);

// ------------------- Admin Routes ------------------- //
// Get all subscribers (Admin only)
router.get("/subscribers", adminAuth, getAllSubscribers);

// Delete a subscriber by ID (Admin only)
// Single delete (already exists)
router.delete("/subscribers/:id", adminAuth, deleteSubscriber);

// Multiple delete (add this)
router.delete("/delete/subscribers", adminAuth, deleteSubscriber);

router.post("/admin/horse-newsletter/send", adminAuth, sendNewsletter);

module.exports = router;
