const express = require("express");
const router = express.Router();

const adminAuth = require("../../middleware/admin/adminAuth");
const adminDashboardController = require("../../controllers/admin/admin.dashboardController");

router.get("/overview", adminAuth, adminDashboardController.getDashboardOverview);
router.get("/apis", adminAuth, adminDashboardController.getAdminApiCatalog);

module.exports = router;
