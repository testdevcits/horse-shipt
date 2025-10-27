const express = require("express");
const router = express.Router();
const multer = require("multer");

// ---------------- Middleware ----------------
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");

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
} = require("../../controllers/customer/customerShipmentController");

const {
  sendMessage,
  getMessages,
} = require("../../controllers/customer/shipmentMessageController");

const {
  getQuotesByShipment,
  acceptQuote,
  addQuote,
  getMyQuotes,
} = require("../../controllers/customer/customerQuoteController");

// ---------------- Multer Memory Storage ----------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ====================================================
// CUSTOMER PROFILE
// ====================================================
router.put(
  "/update-profile",
  customerAuth,
  upload.single("profilePicture"),
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

// Create shipment (accept any file)
router.post(
  "/shipments",
  customerAuth,
  upload.any(),
  (req, res, next) => {
    console.log("=== Received shipment data ===");
    console.log("Body:", req.body);
    console.log("Files:", req.files);
    next();
  },
  createShipment
);

router.get("/shipments", customerAuth, getShipmentsByCustomer);
router.get("/shipments/:shipmentId", customerAuth, getShipmentById);

router.put("/shipments/:shipmentId", customerAuth, async (req, res) => {
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
});

router.delete("/shipments/:shipmentId", customerAuth, deleteShipment);
router.patch(
  "/shipments/:shipmentId/location",
  customerAuth,
  updateShipmentLocation
);

// ====================================================
// CHAT ROUTES (FOR CUSTOMER)
// ====================================================

// Send message to shipper
router.post("/messages/send", customerAuth, sendMessage);

// Get messages for a specific shipment
router.get("/messages/:shipmentId", customerAuth, getMessages);

// ====================================================
// QUOTE ROUTES
// ====================================================

// Add quote (for future flexibility)
router.post("/quotes/add", customerAuth, addQuote);

// View all quotes created by this customer
router.get("/quotes/my", customerAuth, getMyQuotes);

// View all quotes for a specific shipment
router.get("/quotes/:shipmentId", customerAuth, getQuotesByShipment);

// Accept a quote
router.put("/quotes/:quoteId/accept", customerAuth, acceptQuote);

// ====================================================
// EXPORT ROUTER
// ====================================================
module.exports = router;
