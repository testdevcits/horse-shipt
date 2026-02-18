const mongoose = require("mongoose");

// ---------------- Location Schema ----------------
const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// ---------------- Horse Snapshot Schema ----------------
const horseSchema = new mongoose.Schema(
  {
    registeredName: { type: String, required: true },
    barnName: { type: String, default: "" },

    breed: { type: String, required: true },
    otherBreed: {
      type: String,
      default: "",
      validate: {
        validator: function (value) {
          if (this.breed === "Other Breed") {
            return value && value.trim().length > 0;
          }
          return true;
        },
        message: "Other breed is required when 'Other Breed' is selected",
      },
    },

    sex: {
      type: String,
      enum: ["Stallion", "Gelding", "Mare", "Colt", "Filly"],
      required: true,
    },

    colour: { type: String, default: "" },
    age: { type: Number, default: null },

    requestedStallSize: {
      type: String,
      enum: ["Box", "1/2 Box", "Single Stall"],
      required: true,
    },

    photo: {
      url: { type: String, default: null },
      public_id: { type: String, default: null },
    },

    documents: {
      coggins: {
        url: { type: String, default: null },
        public_id: { type: String, default: null },
      },
      healthCertificate: {
        url: { type: String, default: null },
        public_id: { type: String, default: null },
      },
      other: {
        url: { type: String, default: null },
        public_id: { type: String, default: null },
      },
    },

    generalInfo: { type: String, default: "" },
  },
  { _id: false }
);

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

    shipmentCode: {
      type: String,
      unique: true,
      index: true,
    },

    publish: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },

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

    // ---------------- Pickup ----------------
    pickupLocation: { type: String, required: true },

    pickupCoords: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },

    pickupTimeOption: { type: String, required: true },
    pickupDate: { type: Date, required: true },

    // ---------------- Delivery ----------------
    deliveryLocation: { type: String, required: true },

    deliveryCoords: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },

    deliveryTimeOption: { type: String, required: true },
    deliveryDate: { type: Date, required: true },

    // ---------------- Horses ----------------
    numberOfHorses: {
      type: Number,
      required: true,
      min: 1,
    },

    horses: {
      type: [horseSchema],
      validate: {
        validator: function (value) {
          return value.length === this.numberOfHorses;
        },
        message: "Number of horses must match horse details provided",
      },
    },

    additionalInfo: { type: String, default: "" },

    // ---------------- Live Tracking ----------------
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
