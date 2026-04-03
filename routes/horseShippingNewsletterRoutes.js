// routes/horseShippingNewsletterRoutes.js

const express = require("express");
const router = express.Router();

const {
  subscribeNewsletter,
  verifyEmail,
} = require("../controllers/horseShippingNewsletterController");

// Subscribe (email enter karega user)
router.post("/subscribe", subscribeNewsletter);

// Verify Email (link se verify hoga)
router.get("/verify", verifyEmail);

module.exports = router;
