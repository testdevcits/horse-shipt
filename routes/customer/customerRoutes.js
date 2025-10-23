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
  requestOtp,
  verifyOtp,
} = require("../../controllers/customer/customerController");

const {
  getSettings,
  updateSetting,
} = require("../../controllers/customer/customerNotificationController");

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
router.post("/payment", customerAuth, addOrUpdatePayment);
router.get("/payment", customerAuth, getPaymentByUser);
router.get("/payment/:id", customerAuth, getPaymentById);
router.get("/payments", customerAuth, getAllPayments);
router.patch("/payment/:id/toggle", customerAuth, togglePaymentStatus);
router.post("/payment/request-otp", customerAuth, requestOtp);
router.post("/payment/verify-otp", customerAuth, verifyOtp);

// ---------------- Notifications ----------------
router.get("/notifications", customerAuth, getSettings);
router.put("/notifications/:type", customerAuth, updateSetting);

module.exports = router;
