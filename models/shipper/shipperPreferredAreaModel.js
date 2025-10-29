const mongoose = require("mongoose");

const shipperPreferredAreaSchema = new mongoose.Schema(
  {
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper", // Reference to Shipper model
      required: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    radiusMiles: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "ShipperPreferredArea",
  shipperPreferredAreaSchema
);
