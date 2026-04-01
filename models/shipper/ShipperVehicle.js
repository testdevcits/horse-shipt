const mongoose = require("mongoose");

const shipperVehicleSchema = new mongoose.Schema(
  {
    // ================= OWNER =================
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
    },

    // ================= DRIVER (NEW) =================
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },

    driverStatus: {
      type: String,
      enum: ["AVAILABLE", "BUSY", "OFFLINE"],
      default: "AVAILABLE",
    },

    currentShipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShipmentQuote",
      default: null,
    },

    // ================= VEHICLE TYPE =================
    transportType: {
      type: String,
      enum: ["Trucking"],
      default: "Trucking",
    },

    vehicleType: {
      type: String,
      required: true,
    },

    vehicleNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },

    vinNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      default: null,
    },

    // ================= VEHICLE META =================
    manufacturer: {
      type: String,
      trim: true,
      default: "",
    },

    model: {
      type: String,
      trim: true,
      default: "",
    },

    modelYear: {
      type: Number,
      default: null,
    },

    bodyClass: {
      type: String,
      default: "",
    },

    engineType: {
      type: String,
      default: "",
    },

    // ================= VERIFICATION =================
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },

    verificationMeta: {
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
      },
      verificationSource: {
        type: String,
        default: "NHTSA_API",
      },
    },

    // ================= TRAILER DETAILS =================
    trailerType: {
      type: String,
      enum: ["Stock Trailer", "Slant Load", "Head to Head", "Semi", "Other"],
      default: "Stock Trailer",
    },

    numberOfStalls: {
      type: Number,
      required: true,
    },

    stallSize: {
      type: String,
      enum: ["Single Stall", "Stall and a Half", "Box Stall", "Other"],
      required: true,
    },

    vinMetaData: {
      type: Object,
      default: null,
    },

    // ================= IMAGES =================
    images: [
      {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],

    // ================= EXTRA =================
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShipperVehicle", shipperVehicleSchema);
