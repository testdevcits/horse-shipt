const express = require("express");
const router = express.Router();

const {
  subscribeNewsletter,
  verifyEmail,
} = require("../controllers/horseShippingNewsletterController");

// ------------------- Public Routes ------------------- //
// Subscribe (user enters email)
router.post("/subscribe", subscribeNewsletter);

// Verify Email (via email link)
router.get("/verify", verifyEmail);

module.exports = router;
