const express = require("express");
const router = express.Router();

const adminShipperController = require("../../controllers/admin/admin.shipperController");
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const canAccessShippers = requireAdminPermission("shippers:list");

// ================================
//  ADMIN SHIPPER ROUTES
// ================================

// Get all shippers
router.get("/all", adminAuth, canAccessShippers, adminShipperController.getAllShippers);

// Get full shipper profile and operational data
router.get("/:id/full-data", adminAuth, canAccessShippers, adminShipperController.getShipperFullData);

// Get single shipper by ID
router.get("/:id", adminAuth, canAccessShippers, adminShipperController.getShipperById);

// Update shipper details
router.put("/:id", adminAuth, canAccessShippers, adminShipperController.updateShipperById);

// Activate / Deactivate shipper account
router.patch(
  "/:id/status",
  adminAuth,
  canAccessShippers,
  adminShipperController.toggleShipperStatus
);

// Delete shipper
router.delete("/:id", adminAuth, canAccessShippers, adminShipperController.deleteShipper);

module.exports = router;
