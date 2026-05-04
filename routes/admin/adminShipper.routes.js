const express = require("express");
const router = express.Router();

const adminShipperController = require("../../controllers/admin/admin.shipperController");
const adminAuth = require("../../middleware/admin/adminAuth");

// ================================
//  ADMIN SHIPPER ROUTES
// ================================

// Get all shippers
router.get("/all", adminAuth, adminShipperController.getAllShippers);

// Get full shipper profile and operational data
router.get("/:id/full-data", adminAuth, adminShipperController.getShipperFullData);

// Get single shipper by ID
router.get("/:id", adminAuth, adminShipperController.getShipperById);

// Update shipper details
router.put("/:id", adminAuth, adminShipperController.updateShipperById);

// Activate / Deactivate shipper account
router.patch(
  "/:id/status",
  adminAuth,
  adminShipperController.toggleShipperStatus
);

// Delete shipper
router.delete("/:id", adminAuth, adminShipperController.deleteShipper);

module.exports = router;
