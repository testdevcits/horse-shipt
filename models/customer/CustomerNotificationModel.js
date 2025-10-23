const mongoose = require("mongoose");
const Customer = require("./customerModel");

const CustomerNotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
    },
    settings: {
      newQuote: { type: Boolean, default: true },
      offerInteraction: { type: Boolean, default: true },
      newMessage: { type: Boolean, default: true },
      newReview: { type: Boolean, default: true },
      upcomingShipment: { type: Boolean, default: true },
      shipmentUpdates: { type: Boolean, default: true },
    },
    subscription: {
      type: Object,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "CustomerNotification",
  CustomerNotificationSchema
);
