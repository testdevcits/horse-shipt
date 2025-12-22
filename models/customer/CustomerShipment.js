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
    // ================= CUSTOMER & SHIPPER =================
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      default: null,
    },

    // ================= VISIBILITY CONTROL =================
    publish: {
      type: Boolean,
      default: false, // true => visible to all shippers
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    // ================= SHIPMENT STATUS =================
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

    // ================= PICKUP INFO =================
    pickupLocation: { type: String, required: true },
    pickupTimeOption: { type: String, required: true },
    pickupDate: { type: Date, required: true },

    // ================= DELIVERY INFO =================
    deliveryLocation: { type: String, required: true },
    deliveryTimeOption: { type: String, required: true },
    deliveryDate: { type: Date, required: true },

    // ================= HORSES =================
    numberOfHorses: {
      type: Number,
      required: true,
      min: 1,
    },

    horses: [horseSchema],

    // ================= EXTRA INFO =================
    additionalInfo: { type: String, default: "" },

    // ================= LIVE TRACKING =================
    currentLocation: {
      type: locationSchema,
      default: null,
    },

    locationHistory: {
      type: [locationSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// ---------------- INDEXES ----------------

// Prevent a shipper from accepting multiple shipments on same pickup date
shipmentSchema.index(
  { shipper: 1, pickupDate: 1 },
  {
    unique: true,
    partialFilterExpression: {
      shipper: { $type: "objectId" },
    },
  }
);

// Optimize shipper marketplace queries
shipmentSchema.index({ publish: 1, status: 1 });

// ---------------- PRE-SAVE HOOK ----------------
shipmentSchema.pre("save", function (next) {
  if (this.publish && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  console.log("Saving shipment for customer:", this.customer.toString());
  console.log("Published:", this.publish);
  next();
});

module.exports = mongoose.model("CustomerShipment", shipmentSchema);
