// models/HorseShippingNewsletter.js

const mongoose = require("mongoose");

const horseShippingNewsletterSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    tokenExpiry: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "HorseShippingNewsletter",
  horseShippingNewsletterSchema
);
