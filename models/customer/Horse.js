const mongoose = require("mongoose");

const horseSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    registeredName: { type: String, required: true },
    barnName: { type: String, default: "" },

    breed: { type: String, required: true },
    otherBreed: {
      type: String,
      default: "",
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

    sex: {
      type: String,
      enum: ["Stallion", "Gelding", "Mare", "Colt", "Filly"],
      required: true,
    },

    size: { type: String, default: "" },

    defaultStallSize: {
      type: String,
      enum: ["Box", "1/2 Box", "Single Stall"],
      default: "Box",
    },

    photo: {
      url: { type: String, default: null },
      public_id: { type: String, default: null },
    },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

horseSchema.index({ owner: 1, registeredName: 1 }, { unique: false });

module.exports = mongoose.model("Horse", horseSchema);
