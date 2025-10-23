const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");
const {
  updateProfile,
  addOrUpdatePayment,
  getPaymentByUser,
  getAllPayments,
  togglePaymentStatus,
  getPaymentById,
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
// Add new payment or update existing payment using paymentId
router.post("/payment", customerAuth, addOrUpdatePayment);

// Get payment setup for logged-in customer
router.get("/payment", customerAuth, getPaymentByUser);

// Get payment by ID
router.get("/payment/:id", customerAuth, getPaymentById);

// Get all payments (Admin)
router.get("/payments", customerAuth, getAllPayments);

// Activate/deactivate payment by ID (Admin)
router.patch("/payment/:id/toggle", customerAuth, togglePaymentStatus);

module.exports = router;
