const express = require("express");
const router = express.Router();

const adminShipmentController = require("../../controllers/admin/admin.shipmentController");
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const canAccessShipments = requireAdminPermission("shipments:view");

router.get("/all", adminAuth, canAccessShipments, adminShipmentController.getAllShipments);
router.get("/:id/tracking", adminAuth, canAccessShipments, adminShipmentController.getShipmentTracking);
router.get("/:id", adminAuth, canAccessShipments, adminShipmentController.getShipmentById);

module.exports = router;
