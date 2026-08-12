const express = require("express");
const router = express.Router();

const platformSettingsController = require("../../../controllers/admin/Payments/platformSettingsController");
const adminAuth = require("../../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../../middleware/admin/permissionMiddleware");
const canManagePlatform = requireAdminPermission("platform:manage");

// ================================
//  ADMIN PLATFORM SETTINGS ROUTES
// ================================

// Get platform settings
router.get("/", adminAuth, canManagePlatform, platformSettingsController.getPlatformSettings);

// Create / Update platform settings
router.put("/", adminAuth, canManagePlatform, platformSettingsController.updatePlatformSettings);

module.exports = router;
