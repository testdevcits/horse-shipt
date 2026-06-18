const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const {
  getSocialMediaSettings,
  createSocialMediaSettings,
  updateSocialMediaSettings,
  deleteSocialMediaSetting,
} = require("../../controllers/admin/socialMediaSettings.controller");

router.get("/", adminAuth, getSocialMediaSettings);
router.post("/", adminAuth, createSocialMediaSettings);
router.put("/", adminAuth, updateSocialMediaSettings);
router.delete("/:platform", adminAuth, deleteSocialMediaSetting);

module.exports = router;
