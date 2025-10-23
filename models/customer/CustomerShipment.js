const mongoose = require("mongoose");

// ---------------- Horse Schema ----------------
const horseSchema = new mongoose.Schema({
  registeredName: { type: String, required: true },
  barnName: { type: String, default: "" },
  breed: { type: String, default: "" },
  colour: { type: String, default: "" },
  age: { type: String, default: "" },
  sex: { type: String, default: "" },
  photo: {
    url: { type: String, default: null },
    public_id: { type: String, default: null },
  },
  cogins: {
    url: { type: String, default: null },
    public_id: { type: String, default: null },
  },
  healthCertificate: {
    url: { type: String, default: null },
    public_id: { type: String, default: null },
  },
  generalInfo: { type: String, default: "" },
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
    pickupDate: { type: Date, required: true },

    // Delivery Info
    deliveryLocation: { type: String, required: true },
    deliveryTimeOption: { type: String, required: true },
    deliveryDate: { type: Date, required: true },

    // Horses
    numberOfHorses: { type: Number, required: true, min: 1 },
    horses: [horseSchema],

    // Additional Info
    additionalInfo: { type: String, default: "" },

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

// ---------------- Pre-save Logging ----------------
shipmentSchema.pre("save", function (next) {
  console.log("Saving shipment for customer:", this.customer.toString());
  console.log("Number of horses:", this.numberOfHorses);
  next();
});

module.exports = mongoose.model("CustomerShipment", shipmentSchema);
