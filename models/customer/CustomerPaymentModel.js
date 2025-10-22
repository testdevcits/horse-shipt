const mongoose = require("mongoose");

const customerPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true, // faster lookups
    },
    serviceName: { type: String, required: true, default: "Stripe" },
    pkLive: { type: String, required: true },
    skLive: { type: String, required: true },
    active: { type: Boolean, default: true },
    lastOtpSentAt: { type: Date }, // track when OTP was last sent
    lastUpdatedByOtp: { type: Boolean, default: false }, // flag if last update used OTP
    softDeleted: { type: Boolean, default: false }, // optional soft delete
  },
  { timestamps: true } // adds createdAt & updatedAt automatically
);

module.exports = mongoose.model("CustomerPayment", customerPaymentSchema);
