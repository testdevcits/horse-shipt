const mongoose = require("mongoose");

// ---------------- Location Schema ----------------
const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// ---------------- Shipper Shipment Schema ----------------
const shipperShipmentSchema = new mongoose.Schema(
  {
    // Reference to Customer Shipment
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
      unique: true, // ensure only one shipper can be assigned to a shipment
    },

    // Reference to Shipper
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
    },

    // Shipment status from shipper perspective
    status: {
      type: String,
      enum: ["assigned", "in_transit", "completed", "cancelled"],
      default: "assigned",
    },

    // Current live location of shipment (updated by shipper)
    currentLocation: {
      type: locationSchema,
      default: null,
    },

    // History of locations for tracking
    locationHistory: {
      type: [locationSchema],
      default: [],
    },

    // Optional notes by shipper
    notes: { type: String },
  },
  { timestamps: true }
);

// ---------------- Index for preventing multiple shipments per shipper on same pickup date ----------------
// This ensures one shipper cannot have two shipments with the same pickupDate
shipperShipmentSchema.index(
  { shipper: 1, shipment: 1 },
  { unique: true } // combination of shipper and shipment must be unique
);

module.exports = mongoose.model("ShipperShipment", shipperShipmentSchema);
