const mongoose = require("mongoose");

const shipperPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper", // reference Shipper model
      required: true,
    },
    serviceName: { type: String, required: true },
    pkLive: { type: String, required: true },
    skLive: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShipperPayment", shipperPaymentSchema);
