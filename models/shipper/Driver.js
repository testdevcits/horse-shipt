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

// ================= LOCATION SCHEMA (IMPROVED) =================
const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number },
    lng: { type: Number },

    // GeoJSON for MongoDB indexing (IMPORTANT)
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [0, 0],
      },
    },

    heading: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },

    updatedAt: { type: Date, default: Date.now },
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

    // ================= ROLE =================
    role: { type: String, enum: ["driver", "admin"], default: "driver" },

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

    // ================= DRIVER STATUS =================
    driverStatus: {
      type: String,
      enum: ["offline", "available", "onTrip"],
      default: "offline",
      index: true,
    },

    // ================= LIVE LOCATION =================
    currentLocation: {
      type: locationSchema,
      default: null,
    },

    // ================= TRACKING FLAGS =================
    isTrackingEnabled: {
      type: Boolean,
      default: false,
    },

    lastActiveAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ================= GEO INDEX (VERY IMPORTANT) =================
driverSchema.index({ "currentLocation.coordinates": "2dsphere" });

// ================= PASSWORD HASH =================
driverSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    if (/^\$2[aby]\$\d{2}\$/.test(this.password)) return next();

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ================= COMPARE PASSWORD =================
driverSchema.methods.comparePassword = async function (plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model("Driver", driverSchema);
