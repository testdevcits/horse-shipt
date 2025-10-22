const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");
const {
  updateProfile,
  addOrUpdatePayment,
  getPaymentByUser,
  getAllPayments,
  togglePaymentStatus,
} = require("../../controllers/customer/customerController");
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");

// ---------------- Profile ----------------
router.put(
  "/update-profile",
  customerAuth,
  upload.single("profilePicture"),
  updateProfile
);

// ---------------- Payment Setup ----------------

// Add or update payment for logged-in customer
router.post("/payment", customerAuth, addOrUpdatePayment);

// Get payment setup for logged-in customer
router.get("/payment", customerAuth, getPaymentByUser);

// Get all payments (Admin access)
router.get("/payments", customerAuth, getAllPayments);

// Activate/deactivate payment by ID (Admin access)
router.patch("/payment/:id/toggle", customerAuth, togglePaymentStatus);

module.exports = router;
