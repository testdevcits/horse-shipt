const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    licenseNumber: { type: String, required: true },
    notes: { type: String, default: "" },

    // Optional: reference to the shipper who owns this driver
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
    },

    // Assigned vehicles
    assignedVehicles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ShipperVehicle",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", driverSchema);
