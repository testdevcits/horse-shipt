const mongoose = require("mongoose");

const shipperVehicleSchema = new mongoose.Schema(
  {
    // Reference to Shipper (User)
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Transport Details
    transportType: {
      type: String,
      enum: ["Trucking", "Air", "Rail", "Sea"],
      default: "Trucking",
    },

    vehicleName: {
      type: String, // e.g., "Vehicle 1"
      required: true,
    },

    vehicleType: {
      type: String, // e.g., "Truck", "Trailer", etc.
      required: true,
    },

    // New field: Trailer Type
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

    // Cloudinary Images
    images: [
      {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],

    // Additional Notes
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShipperVehicle", shipperVehicleSchema);
