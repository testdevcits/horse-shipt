const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");

const {
  updateProfile,
  addOrUpdatePayment,
  getPaymentByUser,
  getAllPayments,
  togglePaymentStatus,
} = require("../../controllers/shipper/shipperController");

// ----------------- Shipper Profile -----------------
router.put(
  "/update-profile",
  shipperAuth,
  upload.single("profilePicture"),
  updateProfile
);

// ----------------- Payment Setup -----------------
// Add or update payment setup
router.post("/payment", shipperAuth, addOrUpdatePayment);

// Get payment setup for logged-in user
router.get("/payment", shipperAuth, getPaymentByUser);

// Get all payments (admin access)
router.get("/payment/all", shipperAuth, getAllPayments);

// Activate / Deactivate a payment
router.patch("/payment/:id/toggle", shipperAuth, togglePaymentStatus);

module.exports = router;
