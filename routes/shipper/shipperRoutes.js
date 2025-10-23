const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");

// ---------------- Controllers ----------------
const {
  updateProfile,
} = require("../../controllers/shipper/shipperController"); // Only profile updates
const {
  getAssignedShipments,
  getShipmentById,
  updateShipmentStatus,
  updateShipmentLocationByShipper,
  getAvailableShipments, // New: pending shipments for self-assignment
  acceptShipment, // New: assign shipment to shipper
} = require("../../controllers/shipper/shipperShipmentController");

// ---------------- Middleware ----------------
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");

// ---------------- Shipper Profile ----------------
router.put(
  "/update-profile",
  shipperAuth,
  upload.single("profilePicture"),
  updateProfile
);

// ---------------- Shipper Shipment Routes ----------------

// Get all shipments **assigned** to the shipper
router.get("/shipments", shipperAuth, getAssignedShipments);

// Get a shipment by ID (only if assigned to this shipper)
router.get("/shipments/:shipmentId", shipperAuth, getShipmentById);

// Update shipment status (e.g., pending -> picked-up -> delivered)
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

// ---------------- New: Shipper Self-Assignment ----------------

// Get all pending shipments available for assignment
router.get("/shipments/available", shipperAuth, getAvailableShipments);

// Accept a shipment (one shipment per date rule enforced)
router.patch("/shipments/:shipmentId/accept", shipperAuth, acceptShipment);

module.exports = router;
