const express = require("express");
const router = express.Router();

const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");

const vehicleController = require("../../controllers/admin/vehicleVerificationController");
const canAccessShippers = requireAdminPermission("shippers:view");

// Controller function must be passed

router.get(
  "/vehicle/queue",
  adminAuth,
  canAccessShippers,
  vehicleController.getVerificationQueue
);

router.post(
  "/vehicle/verify/:vehicleId",
  adminAuth,
  canAccessShippers,
  vehicleController.verifyVehicle
);

module.exports = router;
