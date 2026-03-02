const mongoose = require("mongoose");

const shipperVehicleSchema = new mongoose.Schema(
  {
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
    },

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

    // ===== Vehicle Identification Metadata =====

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

    // ===== Verification System =====

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

    images: [
      {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],

    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShipperVehicle", shipperVehicleSchema);
