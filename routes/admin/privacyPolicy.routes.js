const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const privacyController = require("../../controllers/admin/privacyPolicy.controller");

/**
 * =====================================
 * PRIVACY POLICY ROUTES
 * =====================================
 */

// Admin CRUD
router.post("/", adminAuth, privacyController.createPrivacyPolicy);
router.get("/", adminAuth, privacyController.getPrivacyPolicies);
router.patch("/:id", adminAuth, privacyController.updatePrivacyPolicy);
router.delete("/:id", adminAuth, privacyController.deletePrivacyPolicy);
router.patch(
  "/:id/status",
  adminAuth,
  privacyController.updatePrivacyPolicyStatus
);

// Public Active Policy
router.get("/active", privacyController.getActivePrivacyPolicy);

module.exports = router;
