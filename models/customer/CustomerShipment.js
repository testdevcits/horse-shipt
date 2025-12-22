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

    publish: {
      type: Boolean,
      default: false,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "picked",
        "in_transit",
        "delivered",
        "cancelled",
        "open_for_offers",
      ],
      default: "pending",
    },

    pickupLocation: { type: String, required: true },
    pickupTimeOption: { type: String, required: true },
    pickupDate: { type: Date, required: true },

    deliveryLocation: { type: String, required: true },
    deliveryTimeOption: { type: String, required: true },
    deliveryDate: { type: Date, required: true },

    numberOfHorses: { type: Number, required: true, min: 1 },

    horses: [horseSchema],

    additionalInfo: { type: String, default: "" },

    currentLocation: { type: locationSchema, default: null },

    locationHistory: { type: [locationSchema], default: [] },
  },
  { timestamps: true }
);

// ---------------- INDEXES ----------------
shipmentSchema.index(
  { shipper: 1, pickupDate: 1 },
  { unique: true, partialFilterExpression: { shipper: { $type: "objectId" } } }
);

shipmentSchema.index({ publish: 1, status: 1 });

// ---------------- PRE-SAVE HOOK ----------------
shipmentSchema.pre("save", function (next) {
  try {
    if (this.isModified("publish") && this.publish && !this.publishedAt) {
      this.publishedAt = new Date();
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("CustomerShipment", shipmentSchema);
