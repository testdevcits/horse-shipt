const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: String,
    otp: String,
    role: String, // customer or shipper
    purpose: {
      type: String,
      enum: ["signup", "forgot-password"],
      default: "signup",
    },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiresAt: Date,
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Otp", otpSchema);
