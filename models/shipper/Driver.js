const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ================= Cloudinary Image Schema =================
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: null },
    public_id: { type: String, default: null },
  },
  { _id: false }
);

const driverSchema = new mongoose.Schema(
  {
    // ================= BASIC INFO =================
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    licenseNumber: { type: String, required: true },
    notes: { type: String, default: "" },

    // ================= PROFILE IMAGE =================
    profileImage: {
      type: imageSchema,
      default: { url: null, public_id: null },
    },

    // ================= RELATIONS =================
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
    },

    assignedVehicles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ShipperVehicle",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ================= Pre-save hook to hash password =================
driverSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ================= Compare password method =================
driverSchema.methods.comparePassword = async function (plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model("Driver", driverSchema);
