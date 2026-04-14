const express = require("express");
const router = express.Router();
const path = require("path");

// ================= MIDDLEWARE =================
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");
const upload = require("../../middleware/uploadMiddleware");

// ----- DRIVER AUTH MIDDLEWARE -----
const driverAuth = require("../../middleware/shipper/driverAuth");

const {
  markShipmentDelivered,
  verifyDeliveryOtp,
  shipperPayout,
  getShipmentDeliveryStatus,
  getShipperStripePayoutHistory,
} = require("../../controllers/shipper/deliveryController");

// ================= CONTROLLERS =================

// -------- Shipper Profile --------
const {
  updateProfile,
} = require("../../controllers/shipper/shipperController");

const {
  updateProfileImage,
  updateBannerImage,
  getShipperProfile,
} = require("../../controllers/shipper/shipperImageController");

// -------- Shipments --------
const {
  getAssignedShipments,
  getShipmentById,
  updateShipmentStatus,
  getAvailableShipments,
  acceptShipment,
  getAllPublishedShipmentsForMap,
} = require("../../controllers/shipper/shipperShipmentController");

// -------- Quotes --------
const {
  addQuote,
  getMyQuotes,
  getQuotesByShipment,
  acceptQuote,
  getAcceptedQuoteByShipment,
  shipperCancelQuote,
  deleteQuote,
  assignVehicleToQuote,
} = require("../../controllers/shipper/shipperQuoteController");

// -------- Messages --------
const {
  sendMessage,
  getMessages,
} = require("../../controllers/shipper/shipmentMessageController");

// -------- Location --------
const {
  getCurrentLocation,
  updateCurrentLocation,
} = require("../../controllers/shipper/shipperLocationController");

// -------- Preferred Areas --------
const {
  addPreferredArea,
  getPreferredAreas,
  updatePreferredArea,
  deletePreferredArea,
} = require("../../controllers/shipper/shipperPreferredAreaController");

// -------- Settings --------
const {
  getSettings,
  updateSettings,
  getSettingsById,
} = require("../../controllers/shipper/shipperSettingsController");

// -------- Drivers (Shipper Admin) --------
const {
  addDriver,
  getMyDrivers,
  assignVehiclesToDriver,
  updateDriver,
  deleteDriver,
  toggleDriverStatus,
} = require("../../controllers/shipper/driverController");

// -------- Driver Auth / Self --------
const {
  driverLogin,
  getDriverDashboard,
  updateDriverProfileImage,
  deleteDriverProfileImage,
  getDriverAssignedShipments,
  startTrip,
  updateDriverLocation,
  completeShipment,
  driverSendDeliveryOtp,
  driverVerifyDeliveryOtp,
} = require("../../controllers/shipper/driver/driverController");

// -------- Contracts --------
const {
  uploadContract,
  updateContract,
  getMyContract,
  deactivateContract,
} = require("../../controllers/shipper/shipperContractController");

const {
  getCustomersForChat,
} = require("../../controllers/shipper/shipperChatListController");

// -------- Reviews --------
const {
  updateGoogleReviewLink,
  getGoogleReviewLink,
} = require("../../controllers/shipper/shipperReviewController");

// -------- STRIPE ROUTES --------
const {
  createStripeAccount,
  createOnboardingLink,
  checkStripeStatus,
  stripeWebhook,
  createStripeCustomer,
  createSetupIntent,
  savePaymentMethod,
  getPaymentStatus,
  getSubscriptionPlan,
  createSubscription,
  cancelSubscription,
  getShipperSubscriptionStatus,
  getBillingHistory,
} = require("../../controllers/shipper/shipperStripeController");

// -------- Vehicles --------
const {
  addVehicle,
  getMyVehicles,
  updateVehicle,
  deleteVehicle,
  verifyVehicle,
  assignDriverToVehicle,
} = require("../../controllers/shipper/shipperVehicleController");

// ====================================================
// SHIPPER PROFILE ROUTES
// ====================================================

router.put(
  "/update-profile",
  shipperAuth,
  upload.single("profilePicture"),
  updateProfile
);

router.get("/profile", shipperAuth, getShipperProfile);

router.put(
  "/update-profile-image",
  shipperAuth,
  upload.single("image"),
  updateProfileImage
);

router.put(
  "/update-banner-image",
  shipperAuth,
  upload.single("image"),
  updateBannerImage
);

// ====================================================
// SHIPPER SHIPMENT ROUTES
// ====================================================

router.get("/shipments", shipperAuth, getAssignedShipments);
router.get("/shipments/available", shipperAuth, getAvailableShipments);

router.patch(
  "/shipments/:shipmentId/status",
  shipperAuth,
  updateShipmentStatus
);
// routes/shipper/shipper.routes.js

// Shipper map – all available shipments
router.get("/shipments/map", shipperAuth, getAllPublishedShipmentsForMap);
router.get("/shipments/:shipmentId", shipperAuth, getShipmentById);
router.patch("/shipments/:shipmentId/accept", shipperAuth, acceptShipment);

// ====================================================
// QUOTE ROUTES
// ====================================================

router.post("/quotes/add", shipperAuth, addQuote);
router.post("/assign-vehicle", shipperAuth, assignVehicleToQuote);
router.get("/quotes/mq", shipperAuth, getMyQuotes);
router.get("/quotes/shipment/:shipmentId", getQuotesByShipment);
router.get(
  "/quotes/accepted/:shipmentId",
  shipperAuth,
  getAcceptedQuoteByShipment
);
router.post("/quotes/cancel", shipperAuth, shipperCancelQuote);
router.delete("/delete/:quoteId", shipperAuth, deleteQuote);

// ====================================================
// MESSAGE ROUTES
// ====================================================

router.post("/messages/send", shipperAuth, sendMessage);
router.get("/messages/:shipmentId", shipperAuth, getMessages);

// ====================================================
// VEHICLE ROUTES
// ====================================================

router.post("/vehicles", shipperAuth, upload.array("images", 5), addVehicle);
router.post("/vehicles/verify/:vehicleId", shipperAuth, verifyVehicle);
router.post("/vehicles/assign-driver", shipperAuth, assignDriverToVehicle);
router.get("/vehicles", shipperAuth, getMyVehicles);

router.put(
  "/vehicles/:vehicleId",
  shipperAuth,
  upload.array("images", 5),
  updateVehicle
);

router.delete("/vehicles/:vehicleId", shipperAuth, deleteVehicle);

// ====================================================
// SHIPPER SETTINGS ROUTES
// ====================================================

router.get("/settings", shipperAuth, getSettings);

router.post("/settings/update-notifications", shipperAuth, updateSettings);

router.get("/settings/:shipperId", shipperAuth, getSettingsById);

// ====================================================
// LOCATION ROUTES
// ====================================================

router.get("/current-location", shipperAuth, getCurrentLocation);
router.put("/update-location", shipperAuth, updateCurrentLocation);

// ====================================================
// PREFERRED AREAS ROUTES
// ====================================================

router.post("/preferred-areas", shipperAuth, addPreferredArea);
router.get("/preferred-areas", shipperAuth, getPreferredAreas);

router.put("/preferred-areas/:areaId", shipperAuth, updatePreferredArea);

router.delete("/preferred-areas/:areaId", shipperAuth, deletePreferredArea);

// ====================================================
// DRIVER ROUTES (SHIPPER ADMIN)
// ====================================================

router.post("/drivers", shipperAuth, addDriver);
router.get("/drivers", shipperAuth, getMyDrivers);
router.post("/drivers/assign-vehicles", shipperAuth, assignVehiclesToDriver);
router.put("/drivers/:driverId", shipperAuth, updateDriver);
router.delete("/drivers/:driverId", shipperAuth, deleteDriver);
// Toggle Active / Deactive (NEW)
router.patch(
  "/drivers/:driverId/toggle-status",
  shipperAuth,
  toggleDriverStatus
);

// ====================================================
// DRIVER LOGIN & SELF ROUTES (NO SHIPPER AUTH)
// ====================================================
// AUTH

router.post("/driver/login", driverLogin);

// DASHBOARD
router.get("/driver/me", driverAuth, getDriverDashboard);

// PROFILE
router.put(
  "/driver/profile-image",
  driverAuth,
  upload.single("image"),
  updateDriverProfileImage
);
router.delete("/driver/profile-image", driverAuth, deleteDriverProfileImage);

// SHIPMENTS
router.get(
  "/driver/assigned-shipments",
  driverAuth,
  getDriverAssignedShipments
);

router.post("/driver/start-trip", driverAuth, startTrip);
router.post("/driver/update-location", driverAuth, updateDriverLocation);
router.post("/driver/complete-shipment", driverAuth, completeShipment);

router.post(
  "/driver/shipment/:shipmentId/send-delivery-otp",
  driverAuth,
  driverSendDeliveryOtp
);

router.post(
  "/driver/shipment/:shipmentId/verify-delivery-otp",
  driverAuth,
  driverVerifyDeliveryOtp
);

// ====================================================
// SHIPPER CONTRACT ROUTES
// ====================================================

// Upload contract (First time)
router.post(
  "/contracts/upload",
  shipperAuth,
  upload.single("contractFile"),
  uploadContract
);

// Update contract (Replace existing)
router.put(
  "/contracts/update",
  shipperAuth,
  upload.single("contractFile"),
  updateContract
);

// Get my active contract
router.get("/contracts", shipperAuth, getMyContract);

// Deactivate contract (Soft delete)
router.patch("/contracts/deactivate", shipperAuth, deactivateContract);

// ====================================================
// CHAT LIST (Shipper Dashboard)
// ====================================================
router.get("/chat/customers", shipperAuth, getCustomersForChat);

// ====================================================
// SHIPPER REVIEW ROUTES
// ====================================================

// Shipper → Add / Update Google Review Link
router.put("/reviews/google-link", shipperAuth, updateGoogleReviewLink);
router.get("/reviews/google-link", shipperAuth, getGoogleReviewLink);

// ================= STRIPE ACCOUNT =================
router.post("/stripe/create-account", shipperAuth, createStripeAccount);
router.post("/stripe/onboarding", shipperAuth, createOnboardingLink);
router.get("/stripe/status", shipperAuth, checkStripeStatus);

// ================= SUBSCRIPTION =================
router.get("/stripe/subscription-plan", shipperAuth, getSubscriptionPlan);

router.post("/stripe/subscription/create", shipperAuth, createSubscription);

router.post("/stripe/subscription/cancel", shipperAuth, cancelSubscription);

router.get(
  "/stripe/subscription/status",
  shipperAuth,
  getShipperSubscriptionStatus
);

router.get("/stripe/subscription/invoices", shipperAuth, getBillingHistory);

// ====================================================
// SHIPPER Delivered ROUTES
// ====================================================

// mark shipment delivered → OTP sent
router.post(
  "/shipment/:shipmentId/mark-delivered",
  shipperAuth,
  markShipmentDelivered
);

// verify OTP → wallet credit
router.post(
  "/shipment/:shipmentId/verify-delivery-otp",
  shipperAuth,
  verifyDeliveryOtp
);

router.get(
  "/shipper/payout-history",
  shipperAuth,
  getShipperStripePayoutHistory
);
// shipper payout request
router.post("/shipper/payout", shipperAuth, shipperPayout);

// check shipment delivery status
router.get(
  "/shipment/:shipmentId/delivery-status",
  shipperAuth,
  getShipmentDeliveryStatus
);

router.post("/create-customer", shipperAuth, createStripeCustomer);
router.post("/setup-intent", shipperAuth, createSetupIntent);
router.post("/save-payment-method", shipperAuth, savePaymentMethod);
router.get("/status", shipperAuth, getPaymentStatus);
// ====================================================
// EXPORT
// ====================================================

module.exports = router;
