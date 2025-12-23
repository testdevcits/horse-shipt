const mongoose = require("mongoose");

const customerQuoteSchema = new mongoose.Schema(
  {
    // ================= RELATIONS =================
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
      index: true,
    },

    shipperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      index: true,
    },

    // ================= PRICING =================
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // ================= MESSAGE =================
    message: {
      type: String,
      trim: true,
      default: "",
    },

    // ================= DELIVERY =================
    estimatedDeliveryDays: {
      type: Number,
      min: 0,
    },

    // ================= STATUS =================
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

// ================= INDEXES =================

// Prevent same shipper sending multiple quotes for same shipment
customerQuoteSchema.index({ shipmentId: 1, shipperId: 1 }, { unique: true });

module.exports = mongoose.model("CustomerQuote", customerQuoteSchema);
