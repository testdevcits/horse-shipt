const mongoose = require("mongoose");

const customerPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer", // change this to your Customer model
      required: true,
    },
    serviceName: { type: String, required: true, default: "Stripe" },
    pkLive: { type: String, required: true },
    skLive: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerPayment", customerPaymentSchema);
