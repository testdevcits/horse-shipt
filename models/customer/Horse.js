const mongoose = require("mongoose");

const horseSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    registeredName: {
      type: String,
      required: true,
      trim: true,
    },

    barnName: {
      type: String,
      default: "",
      trim: true,
    },

    breed: {
      type: String,
      required: true,
      trim: true,
    },

    otherBreed: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (this.breed === "Other Breed") {
            return v && v.trim().length > 0;
          }
          return true;
        },
        message: "Other breed is required",
      },
    },

    colour: {
      type: String,
      default: "",
      trim: true,
    },

    age: {
      type: String, // keep string (2, 3 yrs, 4+, etc.)
      default: "",
      trim: true,
    },

    sex: {
      type: String,
      enum: ["Stallion", "Gelding", "Mare", "Colt", "Filly"],
      required: true,
    },

    defaultStallSize: {
      type: String,
      enum: ["Box", "1/2 Box", "Single Stall"],
      default: "Box",
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

// Unique per customer
horseSchema.index({ owner: 1, registeredName: 1 }, { unique: true });

module.exports = mongoose.model("Horse", horseSchema);
