const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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
    profilePicture: { type: String },
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

// ---------------- Password Hashing ----------------
// Only hash if password changed AND account is local
shipperSchema.pre("save", async function (next) {
  if (!this.isModified("password") || this.provider === "google") return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ---------------- Password Verification ----------------
shipperSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Shipper", shipperSchema);
