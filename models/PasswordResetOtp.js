const mongoose = require("mongoose");

const passwordResetOtpSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["shipper", "customer", "driver"],
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

passwordResetOtpSchema.index({ role: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("PasswordResetOtp", passwordResetOtpSchema);
