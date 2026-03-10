const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    platformFeePercent: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },

    platformFeeFlat: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "usd",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("platformSettings", platformSettingsSchema);
