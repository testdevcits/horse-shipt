const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");
const {
  updateProfile,
} = require("../../controllers/customer/customerController");
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");

router.put(
  "/update-profile",
  customerAuth,
  upload.single("profilePicture"),
  updateProfile
);

module.exports = router;
