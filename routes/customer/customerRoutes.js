const express = require("express");
const router = express.Router();

// ---------------- Middleware ----------------
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");

const upload = require("../../middleware/uploadMiddleware");

// ---------------- Controllers ----------------
const {
  addOrUpdatePayment,
  getPaymentByUser,
  togglePaymentStatus,
  getPaymentById,
  requestOtp,
  verifyOtp,
  updateCustomerProfileImage,
  getCustomerProfile,
  updateCustomerDetails,
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
  updateShipmentByCustomer,
  updateShipmentMetadataByCustomer,
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
  cancelQuote,
  getCustomerStripePayments,
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

router.put("/profile-details", customerAuth, updateCustomerDetails);

// ---------------- Reviews ----------------
const {
  addReview,
  updateMyReview,
  deleteMyReview,
  getMyReviews,
  getReviewsByShipper,
  getTopRatedShippers,
  getShipperProfileDetail,
} = require("../../controllers/shipper/shipperReviewController");
// ====================================================
// PAYMENT ROUTES
// ====================================================

router.post("/payment", customerAuth, addOrUpdatePayment);
router.get("/payment", customerAuth, getPaymentByUser);
router.get("/payment/:id", customerAuth, getPaymentById);
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

router.patch(
  "/shipments/:shipmentId/metadata",
  customerAuth,
  upload.any(),
  updateShipmentMetadataByCustomer
);

router.put(
  "/shipments/:shipmentId",
  customerAuth,
  upload.any(),
  (req, res, next) => {
    console.log("=== Shipment Update Debug ===");
    console.log("Body:", req.body);
    console.log(
      "Files:",
      (req.files || []).map((f) => ({
        fieldname: f.fieldname,
        originalname: f.originalname,
      }))
    );
    next();
  },
  updateShipmentByCustomer
);

// Publish shipment
router.patch("/shipments/:shipmentId/publish", customerAuth, publishShipment);

const inviteRoute = require("./inviteRoute"); // the new route file
const {
  getMatchingShippers,
} = require("../../controllers/customer/shipmentMatchingController");
const {
  sendInvitation,
} = require("../../controllers/customer/shipmentInvitationController");
router.use("/shipment", inviteRoute);
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
router.get("/payments", customerAuth, getCustomerStripePayments);

router.get(
  "/shipments/:shipmentId/matching-shippers",
  customerAuth,
  getMatchingShippers
);

router.post("/shipments/send-invitation", customerAuth, sendInvitation);
// ====================================================
// PAYMENT (QUOTE PAYMENT)
// ====================================================

router.post("/quotes/:quoteId/pay", customerAuth, createPaymentIntent);

router.post("/quotes/:quoteId/cancel", customerAuth, cancelQuote);

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
// ======= NEW: Top Rated Shippers =======
router.get("/shippers/top-rated", getTopRatedShippers);

router.get("/shipper-profile/:shipperId", getShipperProfileDetail);
// ====================================================
// EXPORT ROUTER
// ====================================================
module.exports = router;
