const mongoose = require("mongoose");
const Customer = require("./customerModel"); // reference to your existing Customer model

const CustomerNotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer", // reference Customer collection
      required: true,
      unique: true, // ensure one settings document per customer
    },
    settings: {
      newQuote: { type: Boolean, default: true },
      offerInteraction: { type: Boolean, default: true },
      newMessage: { type: Boolean, default: true },
      newReview: { type: Boolean, default: true },
      upcomingShipment: { type: Boolean, default: true },
      shipmentUpdates: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "CustomerNotification",
  CustomerNotificationSchema
);
