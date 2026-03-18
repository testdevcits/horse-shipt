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
  updateCustomerProfileImage,
  getCustomerProfile,
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
  getShipmentById,
  updateShipment,
  deleteShipment,
  updateShipmentLocation,
  notifyShipmentAccepted,
  fetchShipmentById,
  publishShipment,
  getSingleShipmentForMap,
  getUpcomingShipmentsByCustomer,
  getCompletedShipmentsByCustomer,
} = require("../../controllers/customer/customerShipmentController");

const {
  sendMessage,
  getMessages,
} = require("../../controllers/customer/shipmentMessageController");

const {
  getQuotesByShipment,
  getQuoteById,
  acceptQuoteWithSignature,
  createPaymentIntent,
} = require("../../controllers/customer/customerQuoteController");

const {
  getShippersForChat,
} = require("../../controllers/customer/customerChatListController");
const {
  createHorse,
  getMyHorses,
  updateHorse,
  deleteHorse,
} = require("../../controllers/customer/customerHorseController");

// ====================================================
// CUSTOMER PROFILE
// ====================================================

router.put(
  "/update-profile",
  customerAuth,
  upload.single("profilePicture"), // Cloudinary
  updateProfile
);

// ---------------- Reviews ----------------
const {
  addReview,
  updateMyReview,
  deleteMyReview,
  getMyReviews,
  getReviewsByShipper,
} = require("../../controllers/shipper/shipperReviewController");
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
  upload.any(), // temp storage for Cloudinary
  (req, res, next) => {
    // console.log("=== Shipment Create Debug ===");
    // console.log("User ID:", req.user._id);
    // console.log("Body:", req.body);
    // console.log(
    //   "Files received:",
    //   req.files.map((f) => ({
    //     fieldname: f.fieldname,
    //     originalname: f.originalname,
    //   }))
    // );
    next();
  },
  createShipment
);

router.get("/shipments", customerAuth, getUpcomingShipmentsByCustomer);

router.get(
  "/shipments/completed",
  customerAuth,
  getCompletedShipmentsByCustomer
);

router.get("/shipments/:shipmentId", customerAuth, getShipmentById);

// Publish shipment
router.patch("/shipments/:shipmentId/publish", customerAuth, publishShipment);

// Get single shipment (map data only)
router.get("/shipments/:id/map", customerAuth, getSingleShipmentForMap);

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
router.put("/quotes/:quoteId/accept", customerAuth, acceptQuoteWithSignature);

// ====================================================
// PAYMENT (QUOTE PAYMENT)
// ====================================================

router.post("/quotes/:quoteId/pay", customerAuth, createPaymentIntent);

// ====================================================
// CHAT LIST (Customer Dashboard)
// ====================================================
router.get("/chat/shippers", customerAuth, getShippersForChat);

// ===================================================
// GET /api/customer/profile
// ===================================================
// Protected route: only accessible if customer is logged in
router.get("/profile", customerAuth, getCustomerProfile);

router.put(
  "/profile-image",
  customerAuth,
  upload.single("image"), // field name in form-data: 'image'
  updateCustomerProfileImage
);

// ---------------- HORSE ----------------

router.post("/horses", customerAuth, createHorse);

router.get("/horses", customerAuth, getMyHorses);

router.put("/horses/:horseId", customerAuth, updateHorse);

router.delete("/horses/:horseId", customerAuth, deleteHorse);

// ====================================================
// CUSTOMER REVIEW ROUTES
// ====================================================

// Add Review (Manual Rating)
router.post("/reviews", customerAuth, addReview);

// Update My Review
router.put("/reviews/:reviewId", customerAuth, updateMyReview);

// Delete My Review
router.delete("/reviews/:reviewId", customerAuth, deleteMyReview);

// Get My Reviews
router.get("/reviews", customerAuth, getMyReviews);

router.get("/shipper/:shipperId", getReviewsByShipper);
// ====================================================
// EXPORT ROUTER
// ====================================================
module.exports = router;
