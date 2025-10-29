const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");

// ---------------- Middleware ----------------
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");

// ---------------- Controllers ----------------
const {
  updateProfile,
} = require("../../controllers/shipper/shipperController");

const {
  getAssignedShipments,
  getShipmentById,
  updateShipmentStatus,
  updateShipmentLocationByShipper,
  getAvailableShipments, // Pending shipments for self-assignment
  acceptShipment, // Assign shipment to shipper
} = require("../../controllers/shipper/shipperShipmentController");

// ---------------- Quote Controller ----------------
const {
  addQuote,
  getMyQuotes,
} = require("../../controllers/shipper/shipperQuoteController");

// ---------------- Message Controller ----------------
const {
  sendMessage,
  getMessages,
} = require("../../controllers/shipper/shipmentMessageController");

// ---------------- Vehicle Controller ----------------
const {
  addVehicle,
  getMyVehicles,
  updateVehicle,
  deleteVehicle,
} = require("../../controllers/shipper/shipperVehicleController");

// ---------------- IMAGE UPDATE CONTROLLERS ----------------
const {
  updateProfileImage,
  updateBannerImage,
  getShipperProfile,
} = require("../../controllers/shipper/shipperImageController");

// ----------------   SHIPPER LOCATION   ----------------

const {
  getCurrentLocation,
  updateCurrentLocation,
} = require("../../controllers/shipper/shipperLocationController");

// ====================================================
// SHIPPER PROFILE
// ====================================================

router.put(
  "/update-profile",
  shipperAuth,
  upload.single("profilePicture"),
  updateProfile
);

// ======================================================
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

// ---------------- SETTINGS CONTROLLER ----------------

const {
  getSettings,
  updateSettings,
  getSettingsById,
} = require("../../controllers/shipper/shipperSettingsController");

// ====================================================
// SHIPPER SHIPMENT ROUTES
// ====================================================

// Get all shipments **assigned** to the shipper
router.get("/shipments", shipperAuth, getAssignedShipments);

// Get a shipment by ID (only if assigned to this shipper)
router.get("/shipments/:shipmentId", shipperAuth, getShipmentById);

// Update shipment status (pending → picked-up → delivered)
router.patch(
  "/shipments/:shipmentId/status",
  shipperAuth,
  updateShipmentStatus
);

// Update shipment live location
router.patch(
  "/shipments/:shipmentId/location",
  shipperAuth,
  updateShipmentLocationByShipper
);

// ====================================================
// SHIPPER SELF-ASSIGNMENT
// ====================================================

// Get all pending shipments available for assignment
router.get("/shipments/available", shipperAuth, getAvailableShipments);

// Accept a shipment (only one per date rule enforced)
router.patch("/shipments/:shipmentId/accept", shipperAuth, acceptShipment);

// ====================================================
// QUOTE ROUTES (FOR SHIPPER)
// ====================================================

// Add a new quote for a shipment
router.post("/quotes/add", shipperAuth, addQuote);

// Get all quotes sent by the shipper
router.get("/quotes/my", shipperAuth, getMyQuotes);

// ====================================================
// MESSAGE ROUTES (FOR SHIPPER)
// ====================================================

// Send message to customer (related to shipment)
router.post("/messages/send", shipperAuth, sendMessage);

// Get messages for a specific shipment
router.get("/messages/:shipmentId", shipperAuth, getMessages);

// ====================================================
// VEHICLE ROUTES (FOR SHIPPER)
// ====================================================

//  Add a new vehicle (with multiple images)
router.post("/vehicles", shipperAuth, upload.array("images", 5), addVehicle);

//  Get all vehicles for the logged-in shipper
router.get("/vehicles", shipperAuth, getMyVehicles);

// ✏️ Update vehicle details
router.put(
  "/vehicles/:vehicleId",
  shipperAuth,
  upload.array("images", 5),
  updateVehicle
);

//  Delete a vehicle
router.delete("/vehicles/:vehicleId", shipperAuth, deleteVehicle);

// ====================================================
// SHIPPER SETTINGS ROUTES
// ====================================================
router.get("/settings", shipperAuth, getSettings);
router.post("/settings/update-notifications", shipperAuth, updateSettings);
// get settings by shipperId
router.get("/settings/:shipperId", shipperAuth, getSettingsById);

// ====================================================
// Get Current Location
// ====================================================
router.get("/current-location", shipperAuth, getCurrentLocation);

// ====================================================
// Add or Update Current Location
// ====================================================
router.put("/update-location", shipperAuth, updateCurrentLocation);

// ====================================================
// EXPORT ROUTER
// ====================================================
module.exports = router;
