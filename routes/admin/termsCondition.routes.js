const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const termsController = require("../../controllers/admin/termsCondition.controller");
const canManageLegal = requireAdminPermission("legal:manage");

// Admin CRUD
router.post("/", adminAuth, canManageLegal, termsController.createTermsCondition);
router.get("/", adminAuth, canManageLegal, termsController.getTermsConditions);
router.patch("/:id", adminAuth, canManageLegal, termsController.updateTermsCondition);
router.delete("/:id", adminAuth, canManageLegal, termsController.deleteTermsCondition);
router.patch(
  "/:id/status",
  adminAuth,
  canManageLegal,
  termsController.updateTermsConditionStatus
);

// Public Active Terms
router.get("/active", termsController.getActiveTermsCondition);

module.exports = router;
