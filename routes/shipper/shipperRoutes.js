const express = require("express");
const router = express.Router();
const path = require("path");

// ---------------- Middleware ----------------
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");
const upload = require("../../middleware/uploadMiddleware");

// ---------------- Controllers ----------------
const {
  updateProfile,
} = require("../../controllers/shipper/shipperController");
const {
  getAssignedShipments,
  getShipmentById,
  updateShipmentStatus,
  getAvailableShipments,
  acceptShipment,
} = require("../../controllers/shipper/shipperShipmentController");

const {
  addQuote,
  getMyQuotes,
  getQuotesByShipment,
  acceptQuote,
} = require("../../controllers/shipper/shipperQuoteController");

const {
  sendMessage,
  getMessages,
} = require("../../controllers/shipper/shipmentMessageController");
const {
  addVehicle,
  getMyVehicles,
  updateVehicle,
  deleteVehicle,
} = require("../../controllers/shipper/shipperVehicleController");
const {
  updateProfileImage,
  updateBannerImage,
  getShipperProfile,
} = require("../../controllers/shipper/shipperImageController");
const {
  getCurrentLocation,
  updateCurrentLocation,
} = require("../../controllers/shipper/shipperLocationController");
const {
  addPreferredArea,
  getPreferredAreas,
  updatePreferredArea,
  deletePreferredArea,
} = require("../../controllers/shipper/shipperPreferredAreaController");
const {
  getSettings,
  updateSettings,
  getSettingsById,
} = require("../../controllers/shipper/shipperSettingsController");

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
router.get("/shipments/:shipmentId", shipperAuth, getShipmentById);
router.patch(
  "/shipments/:shipmentId/status",
  shipperAuth,
  updateShipmentStatus
);

router.patch("/shipments/:shipmentId/accept", shipperAuth, acceptShipment);

// ====================================================
// QUOTE ROUTES
// ====================================================

// Shipper routes
router.post("/quotes/add", shipperAuth, addQuote);
router.get("/quotes/my", shipperAuth, getMyQuotes);

// Customer routes
router.get("/quotes/shipment/:shipmentId", getQuotesByShipment);

// Accept a quote (customer uploads Contract.pdf)
router.post(
  "/quotes/accept/:quoteId",
  shipperAuth,
  upload.single("contractFile"), // handled by uploadMiddleware
  acceptQuote
);

// ====================================================
// MESSAGE ROUTES
// ====================================================

router.post("/messages/send", shipperAuth, sendMessage);
router.get("/messages/:shipmentId", shipperAuth, getMessages);

// ====================================================
// VEHICLE ROUTES
// ====================================================

router.post("/vehicles", shipperAuth, upload.array("images", 5), addVehicle);
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
// EXPORT ROUTER
// ====================================================
module.exports = router;
