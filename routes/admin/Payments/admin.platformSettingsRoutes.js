const express = require("express");
const router = express.Router();

const platformSettingsController = require("../../../controllers/admin/Payments/platformSettingsController");
const adminAuth = require("../../../middleware/admin/adminAuth");

// ================================
//  ADMIN PLATFORM SETTINGS ROUTES
// ================================

// Get platform settings
router.get("/", adminAuth, platformSettingsController.getPlatformSettings);

// Create / Update platform settings
router.put("/", adminAuth, platformSettingsController.updatePlatformSettings);

module.exports = router;
