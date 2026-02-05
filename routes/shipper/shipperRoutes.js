const express = require("express");
const router = express.Router();
const path = require("path");

// ================= MIDDLEWARE =================
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");
const upload = require("../../middleware/uploadMiddleware");

// ----- DRIVER AUTH MIDDLEWARE -----
const driverAuth = require("../../middleware/shipper/driverAuth");

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
} = require("../../controllers/shipper/shipperShipmentController");

// -------- Quotes --------
const {
  addQuote,
  getMyQuotes,
  getQuotesByShipment,
  acceptQuote,
  getAcceptedQuoteByShipment,
} = require("../../controllers/shipper/shipperQuoteController");

// -------- Messages --------
const {
  sendMessage,
  getMessages,
} = require("../../controllers/shipper/shipmentMessageController");

// -------- Vehicles --------
const {
  addVehicle,
  getMyVehicles,
  updateVehicle,
  deleteVehicle,
} = require("../../controllers/shipper/shipperVehicleController");

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

router.post("/quotes/add", shipperAuth, addQuote);
router.get("/quotes/mq", shipperAuth, getMyQuotes);
router.get("/quotes/shipment/:shipmentId", getQuotesByShipment);
router.get(
  "/quotes/accepted/:shipmentId",
  shipperAuth,
  getAcceptedQuoteByShipment
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

// Driver Login
router.post("/driver/login", driverLogin);

// Driver Profile + Assigned Vehicles
router.get("/driver/me", driverAuth, getDriverDashboard);
// Driver profile image (SELF ONLY)
router.put(
  "/driver/profile-image",
  driverAuth,
  upload.single("image"),
  updateDriverProfileImage
);

router.delete("/driver/profile-image", driverAuth, deleteDriverProfileImage);

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
// EXPORT
// ====================================================
module.exports = router;
