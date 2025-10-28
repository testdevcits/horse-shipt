const mongoose = require("mongoose");

const shipperSettingsSchema = new mongoose.Schema(
  {
    shipperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      unique: true,
    },
    notifications: {
      quote: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
      },
      opportunity: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
      },
      message: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
      },
      review: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
      },
      shipment: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShipperSettings", shipperSettingsSchema);
