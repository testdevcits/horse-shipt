const mongoose = require("mongoose");

const customerReviewSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

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

    shipperName: {
      type: String,
      required: true,
    },

    reviewText: {
      type: String,
      default: "",
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    isHidden: {
      type: Boolean,
      default: false,
    },

    reviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
  },
  { timestamps: true }
);

customerReviewSchema.index({ shipmentId: 1, shipperId: 1 }, { unique: true });

module.exports = mongoose.model("CustomerReview", customerReviewSchema);
