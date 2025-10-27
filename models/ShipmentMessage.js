const mongoose = require("mongoose");

const shipmentMessageSchema = new mongoose.Schema(
  {
    // Reference to shipment (always required)
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
    },

    // Message sender type
    senderType: {
      type: String,
      enum: ["customer", "shipper"],
      required: true,
    },

    // Customer reference (if sender or receiver)
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true, // every message must belong to a shipment with a customer
    },

    // Shipper reference (if sender or receiver)
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true, // every message must belong to a shipment with a shipper
    },

    // The sender's ID (can be customer or shipper)
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "senderType", // dynamically reference based on senderType
    },

    // Message content
    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// Optional: You can index shipment for faster retrieval
shipmentMessageSchema.index({ shipment: 1 });

module.exports = mongoose.model("ShipmentMessage", shipmentMessageSchema);
