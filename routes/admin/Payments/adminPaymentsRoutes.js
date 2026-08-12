const express = require("express");
const router = express.Router();

const adminAuth = require("../../../middleware/admin/adminAuth");
const adminPaymentsController = require("../../../controllers/admin/Payments/adminPaymentsController");
const { requireAdminPermission } = require("../../../middleware/admin/permissionMiddleware");
const canManagePlatform = requireAdminPermission("platform:manage");

router.get("/summary", adminAuth, canManagePlatform, adminPaymentsController.getPaymentSummary);
router.get("/transactions", adminAuth, canManagePlatform, adminPaymentsController.getAllTransactions);

module.exports = router;
