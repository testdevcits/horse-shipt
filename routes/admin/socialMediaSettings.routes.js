const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const {
  getSocialMediaSettings,
  createSocialMediaSettings,
  updateSocialMediaSettings,
  deleteSocialMediaSetting,
} = require("../../controllers/admin/socialMediaSettings.controller");
const canManageAccountSettings = requireAdminPermission("account:settings");

router.get("/", adminAuth, canManageAccountSettings, getSocialMediaSettings);
router.post("/", adminAuth, canManageAccountSettings, createSocialMediaSettings);
router.put("/", adminAuth, canManageAccountSettings, updateSocialMediaSettings);
router.delete("/:platform", adminAuth, canManageAccountSettings, deleteSocialMediaSetting);

module.exports = router;
