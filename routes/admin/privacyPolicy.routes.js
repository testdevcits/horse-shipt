const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const privacyController = require("../../controllers/admin/privacyPolicy.controller");
const canManageLegal = requireAdminPermission("legal:manage");

/**
 * =====================================
 * PRIVACY POLICY ROUTES
 * =====================================
 */

// Admin CRUD
router.post("/", adminAuth, canManageLegal, privacyController.createPrivacyPolicy);
router.get("/", adminAuth, canManageLegal, privacyController.getPrivacyPolicies);
router.patch("/:id", adminAuth, canManageLegal, privacyController.updatePrivacyPolicy);
router.delete("/:id", adminAuth, canManageLegal, privacyController.deletePrivacyPolicy);
router.patch(
  "/:id/status",
  adminAuth,
  canManageLegal,
  privacyController.updatePrivacyPolicyStatus
);

// Public Active Policy
router.get("/active", privacyController.getActivePrivacyPolicy);

module.exports = router;
