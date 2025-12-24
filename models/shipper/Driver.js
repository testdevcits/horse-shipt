const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    licenseNumber: { type: String, required: true },
    notes: { type: String, default: "" },

    // Optional: reference to the shipper who owns this driver
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
    },

    // Assigned vehicles
    assignedVehicles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ShipperVehicle",
      },
    ],
  },
  { timestamps: true }
);

// ================= Pre-save hook to hash password =================
driverSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // only hash if password is new or modified

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ================= Method to compare password =================
driverSchema.methods.comparePassword = async function (plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model("Driver", driverSchema);
