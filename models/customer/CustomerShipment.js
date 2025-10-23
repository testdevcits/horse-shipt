const mongoose = require("mongoose");

// ---------------- Horse Schema ----------------
const horseSchema = new mongoose.Schema({
  registeredName: { type: String, required: true },
  barnName: { type: String },
  breed: { type: String },
  colour: { type: String },
  age: { type: String },
  sex: { type: String },
  photo: {
    url: { type: String },
    public_id: { type: String },
  },
  cogins: {
    url: { type: String },
    public_id: { type: String },
  },
  healthCertificate: {
    url: { type: String },
    public_id: { type: String },
  },
  generalInfo: { type: String },
});

// ---------------- Location Schema ----------------
const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// ---------------- Shipment Schema ----------------
const shipmentSchema = new mongoose.Schema(
  {
    // Reference to Customer
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    // Assigned Shipper
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      default: null, // Assigned after acceptance
    },

    // Shipment Status
    status: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "picked",
        "in_transit",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },

    // Pickup Info
    pickupLocation: { type: String, required: true },
    pickupTimeOption: { type: String, required: true },
    pickupDate: { type: String, required: true },

    // Delivery Info
    deliveryLocation: { type: String, required: true },
    deliveryTimeOption: { type: String, required: true },
    deliveryDate: { type: String, required: true },

    // Horses
    numberOfHorses: { type: Number, required: true },
    horses: [horseSchema],

    // Additional Info
    additionalInfo: { type: String },

    // Current live location (shipper only)
    currentLocation: {
      type: locationSchema,
      default: null,
    },

    // Route history
    locationHistory: {
      type: [locationSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// ---------------- Compound Index ----------------
// Prevent a shipper from accepting multiple shipments on the same pickup date
shipmentSchema.index(
  { shipper: 1, pickupDate: 1 },
  { unique: true, partialFilterExpression: { shipper: { $type: "objectId" } } }
);

module.exports = mongoose.model("CustomerShipment", shipmentSchema);
