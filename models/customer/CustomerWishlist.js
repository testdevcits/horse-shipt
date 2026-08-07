const mongoose = require("mongoose");

const customerWishlistSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true }
);

customerWishlistSchema.index({ customer: 1, shipper: 1 }, { unique: true });

module.exports = mongoose.model("CustomerWishlist", customerWishlistSchema);
