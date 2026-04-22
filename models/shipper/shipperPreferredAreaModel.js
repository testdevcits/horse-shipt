const mongoose = require("mongoose");

const preferredAreaSchema = new mongoose.Schema(
  {
    // Link to Shipper
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      index: true,
    },

    locationName: {
      type: String,
      default: "",
    },

    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    radiusKm: {
      type: Number,
      default: 50,
    },
  },
  { timestamps: true }
);

// GEO INDEX (very important)
preferredAreaSchema.index({ coordinates: "2dsphere" });

module.exports = mongoose.model("PreferredArea", preferredAreaSchema);
