const express = require("express");
const router = express.Router();

// ---------------- Middleware ----------------
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");

const upload = require("../../middleware/uploadMiddleware");

// ---------------- Controllers ----------------
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
  subscribeToPush,
  sendTestNotification,
} = require("../../controllers/customer/customerPushController");

const {
  createShipment,
  getShipmentsByCustomer,
  getShipmentById,
  updateShipment,
  deleteShipment,
  updateShipmentLocation,
  notifyShipmentAccepted,
  fetchShipmentById,
  publishShipment,
} = require("../../controllers/customer/customerShipmentController");

const {
  sendMessage,
  getMessages,
} = require("../../controllers/customer/shipmentMessageController");

const {
  getQuotesByShipment,
  getQuoteById,
  acceptQuote,
} = require("../../controllers/customer/customerQuoteController");

// ====================================================
// CUSTOMER PROFILE
// ====================================================

router.put(
  "/update-profile",
  customerAuth,
  upload.single("profilePicture"), // Cloudinary
  updateProfile
);

// ====================================================
// PAYMENT ROUTES
// ====================================================

router.post("/payment", customerAuth, addOrUpdatePayment);
router.get("/payment", customerAuth, getPaymentByUser);
router.get("/payment/:id", customerAuth, getPaymentById);
router.get("/payments", customerAuth, getAllPayments);
router.patch("/payment/:id/toggle", customerAuth, togglePaymentStatus);
router.post("/payment/request-otp", customerAuth, requestOtp);
router.post("/payment/verify-otp", customerAuth, verifyOtp);

// ====================================================
// NOTIFICATIONS
// ====================================================

router.get("/notifications", customerAuth, getSettings);
router.put("/notifications/:type", customerAuth, updateSetting);

// ====================================================
// PUSH NOTIFICATIONS
// ====================================================

router.post("/notifications/subscribe", customerAuth, subscribeToPush);
router.post("/test-notification", customerAuth, sendTestNotification);

// ====================================================
// SHIPMENTS
// ====================================================

// Create shipment (images / docs → Cloudinary)
router.post(
  "/shipments",
  customerAuth,
  upload.any(),
  (req, res, next) => {
    console.log("=== Shipment Create Debug ===");
    console.log("Body:", req.body);
    console.log("Files:", req.files);
    next();
  },
  createShipment
);

router.get("/shipments", customerAuth, getShipmentsByCustomer);
router.get("/shipments/:shipmentId", customerAuth, getShipmentById);

// Publish shipment
router.patch("/shipments/:shipmentId/publish", customerAuth, publishShipment);

// Update shipment
router.put(
  "/shipments/:shipmentId",
  customerAuth,
  upload.any(),
  async (req, res) => {
    try {
      const shipmentBefore = await fetchShipmentById(
        req.params.shipmentId,
        req.user._id
      );

      await updateShipment(
        {
          params: { shipmentId: req.params.shipmentId },
          body: req.body,
          user: req.user,
          files: req.files,
        },
        res
      );

      if (
        req.body.status === "accepted" &&
        req.body.shipper &&
        shipmentBefore?.status !== "accepted"
      ) {
        const shipperName = req.body.shipperName || "Your Shipper";
        await notifyShipmentAccepted(req.params.shipmentId, shipperName);
      }
    } catch (err) {
      console.error("Error updating shipment:", err);
      res.status(500).json({ success: false, message: "Server Error" });
    }
  }
);

router.delete("/shipments/:shipmentId", customerAuth, deleteShipment);
router.patch(
  "/shipments/:shipmentId/location",
  customerAuth,
  updateShipmentLocation
);

// ====================================================
// CHAT ROUTES
// ====================================================

router.post("/messages/send", customerAuth, sendMessage);
router.get("/messages/:shipmentId", customerAuth, getMessages);

// ====================================================
// QUOTE ROUTES
// ====================================================

router.get("/quotes/:shipmentId", customerAuth, getQuotesByShipment);
router.get("/quotes/single/:quoteId", customerAuth, getQuoteById);
router.put("/quotes/:quoteId/accept", customerAuth, acceptQuote);

// ====================================================
// EXPORT ROUTER
// ====================================================
module.exports = router;
