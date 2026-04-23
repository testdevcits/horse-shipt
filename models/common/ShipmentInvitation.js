const mongoose = require("mongoose");

const shipmentInvitationSchema = new mongoose.Schema(
  {
    // ============================
    // RELATIONS
    // ============================
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
    },

    // ============================
    // SNAPSHOT (FAST UI)
    // ============================
    shipmentCode: {
      type: String,
      required: true,
    },

    pickupLocation: {
      type: String,
      required: true,
    },

    deliveryLocation: {
      type: String,
      required: true,
    },

    // ============================
    // OPTIONAL MESSAGE
    // ============================
    message: {
      type: String,
      default: "",
    },

    // ============================
    // STATUS
    // ============================
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },

    // ============================
    // TRACKING
    // ============================
    isSeen: {
      type: Boolean,
      default: false,
    },

    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ============================
// UNIQUE INDEX (IMPORTANT )
// ============================
// Prevent duplicate invite
shipmentInvitationSchema.index({ shipment: 1, shipper: 1 }, { unique: true });

module.exports = mongoose.model("ShipmentInvitation", shipmentInvitationSchema);
