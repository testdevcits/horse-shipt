const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: String,
    otp: String,
    role: String, // customer or shipper
    expiresAt: Date,
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Otp", otpSchema);
