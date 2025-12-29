const mongoose = require("mongoose");

const shipperContractSchema = new mongoose.Schema(
  {
    // ================= RELATIONS =================
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },

    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
      unique: true, // One contract per shipment
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

    // ================= SIGNATURES =================
    shipperSignature: {
      type: String, // base64 or image URL
    },
    customerSignature: {
      type: String,
    },
    shipperSignedAt: Date,
    customerSignedAt: Date,

    // ================= STATUS FLOW =================
    status: {
      type: String,
      enum: ["DRAFT", "SENT", "SIGNED", "ACCEPTED", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },

    // ================= FINAL PDF =================
    finalPDF: {
      url: String,
      public_id: String,
    },

    // ================= VERSIONING =================
    version: {
      type: String,
      default: "v1.0",
    },

    // ================= META =================
    uploadedBy: {
      type: String,
      enum: ["shipper", "admin", "system"],
      default: "shipper",
    },

    isActive: {
      type: Boolean,
      default: true,
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

// ================= INDEXES =================
// Fast lookup by shipper and status
shipperContractSchema.index({ shipper: 1, status: 1 });
shipperContractSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model("ShipperContract", shipperContractSchema);
