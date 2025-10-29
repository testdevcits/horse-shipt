const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// -------------------------
// Sub-Schemas
// -------------------------
const loginHistorySchema = new mongoose.Schema({
  deviceId: { type: String, default: null },
  ip: { type: String, default: null },
  loginAt: { type: Date, default: Date.now },
});

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  updatedAt: { type: Date, default: Date.now },
});

// Common image structure for Cloudinary uploads
const imageSchema = new mongoose.Schema({
  url: { type: String, default: null }, // Cloudinary image URL
  public_id: { type: String, default: null }, // Cloudinary public ID
});

// -------------------------
// Main Shipper Schema
// -------------------------
const shipperSchema = new mongoose.Schema(
  {
    // Unique Shipper ID
    uniqueId: { type: String, required: true, unique: true },

    // Basic Info
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String },

    // Role
    role: { type: String, default: "shipper" },

    // OAuth fields (Google login)
    provider: { type: String, enum: ["local", "google"], default: "local" },
    providerId: { type: String },
    profilePicture: { type: String }, // Google default image (if OAuth)

    // Uploaded images via Cloudinary
    profileImage: imageSchema, // Profile Image
    bannerImage: imageSchema, // Banner Image

    // Additional user info
    firstName: { type: String },
    lastName: { type: String },
    locale: { type: String },
    emailVerified: { type: Boolean, default: false },
    rawProfile: { type: Object },

    // Location (for live tracking)
    currentLocation: locationSchema,

    // Login control
    isLogin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    currentDevice: { type: String },

    // Login history
    loginHistory: [loginHistorySchema],
  },
  { timestamps: true }
);

// -------------------------
// Password Hashing (only for local accounts)
// -------------------------
shipperSchema.pre("save", async function (next) {
  if (!this.isModified("password") || this.provider === "google") return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// -------------------------
// Password Verification
// -------------------------
shipperSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// -------------------------
// Export Model
// -------------------------
module.exports = mongoose.model("Shipper", shipperSchema);
