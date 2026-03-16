const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const termsController = require("../../controllers/admin/termsCondition.controller");

// Admin CRUD
router.post("/", adminAuth, termsController.createTermsCondition);
router.get("/", adminAuth, termsController.getTermsConditions);
router.patch("/:id", adminAuth, termsController.updateTermsCondition);
router.delete("/:id", adminAuth, termsController.deleteTermsCondition);
router.patch(
  "/:id/status",
  adminAuth,
  termsController.updateTermsConditionStatus
);

// Public Active Terms
router.get("/active", termsController.getActiveTermsCondition);

module.exports = router;
