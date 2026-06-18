const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    shipperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      index: true,
    },

    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    customerName: {
      type: String,
      required: true,
    },

    reviewText: {
      type: String,
      default: null,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    source: {
      type: String,
      enum: ["google", "manual"],
      default: "manual",
    },

    googleReviewLink: {
      type: String,
      default: null,
    },

    isHidden: {
      type: Boolean,
      default: false,
    },

    reviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

reviewSchema.index({ shipmentId: 1, customerId: 1 }, { unique: true });

module.exports = mongoose.model("ShipperReview", reviewSchema);
