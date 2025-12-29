const mongoose = require("mongoose");

const shipperContractSchema = new mongoose.Schema(
  {
    // ================= RELATION =================
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      unique: true, // One active contract per shipper
      index: true,
    },

    // ================= CONTRACT FILE =================
    contractFile: {
      url: {
        type: String,
        required: true,
      },
      public_id: {
        type: String,
        required: true,
      },
    },

    // ================= VERSIONING =================
    version: {
      type: String,
      default: "v1.0",
    },

    // ================= STATUS =================
    isActive: {
      type: Boolean,
      default: true,
    },

    // ================= META =================
    uploadedBy: {
      type: String,
      enum: ["shipper", "admin"],
      default: "shipper",
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ================= INDEX =================
// Fast lookup
shipperContractSchema.index({ shipper: 1, isActive: 1 });

module.exports = mongoose.model("ShipperContract", shipperContractSchema);
