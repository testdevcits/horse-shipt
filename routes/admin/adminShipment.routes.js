const express = require("express");
const router = express.Router();

const adminShipmentController = require("../../controllers/admin/admin.shipmentController");
const adminAuth = require("../../middleware/admin/adminAuth");

router.get("/all", adminAuth, adminShipmentController.getAllShipments);
router.get("/:id", adminAuth, adminShipmentController.getShipmentById);

module.exports = router;
