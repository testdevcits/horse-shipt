const express = require("express");
const router = express.Router();

const adminAuth = require("../../middleware/admin/adminAuth");

const vehicleController = require("../../controllers/admin/vehicleVerificationController");

// Controller function must be passed

router.get("/vehicle/queue", adminAuth, vehicleController.getVerificationQueue);

router.post(
  "/vehicle/verify/:vehicleId",
  adminAuth,
  vehicleController.verifyVehicle
);

module.exports = router;
