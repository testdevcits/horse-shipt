const mongoose = require("mongoose");

const quoteNegotiationSchema = new mongoose.Schema(
  {
    quote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShipmentQuote",
      required: true,
      index: true,
    },
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      index: true,
    },
    proposedByRole: {
      type: String,
      enum: ["customer", "shipper"],
      required: true,
      index: true,
    },
    proposedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    reason: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected", "countered", "superseded"],
      default: "pending",
      index: true,
    },
    respondedByRole: {
      type: String,
      enum: ["customer", "shipper", null],
      default: null,
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    responseReason: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

quoteNegotiationSchema.index({ quote: 1, createdAt: -1 });
quoteNegotiationSchema.index({ quote: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("QuoteNegotiation", quoteNegotiationSchema);
