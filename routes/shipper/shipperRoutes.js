const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");
const {
  updateProfile,
} = require("../../controllers/shipper/shipperController");
const { shipperAuth } = require("../../middleware/shipper/shipperMiddleware");

router.put(
  "/update-profile",
  shipperAuth,
  upload.single("profilePicture"),
  updateProfile
);

module.exports = router;
