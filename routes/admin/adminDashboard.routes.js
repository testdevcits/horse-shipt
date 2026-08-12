const express = require("express");
const router = express.Router();

const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const adminDashboardController = require("../../controllers/admin/admin.dashboardController");

router.get(
  "/overview",
  adminAuth,
  requireAdminPermission("dashboard:view"),
  adminDashboardController.getDashboardOverview
);
router.get(
  "/apis",
  adminAuth,
  requireAdminPermission("dashboard:view"),
  adminDashboardController.getAdminApiCatalog
);

module.exports = router;
