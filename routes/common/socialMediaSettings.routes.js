const express = require("express");
const router = express.Router();
const {
  getSocialMediaSettings,
} = require("../../controllers/admin/socialMediaSettings.controller");

router.get("/", getSocialMediaSettings);

module.exports = router;
