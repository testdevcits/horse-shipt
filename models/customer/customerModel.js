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

const customerSchema = new mongoose.Schema(
  {
    uniqueId: { type: String, required: true, unique: true },
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, default: "customer" },

    provider: { type: String, enum: ["local", "google"], default: "local" },
    providerId: { type: String },
    profilePicture: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    locale: { type: String },
    emailVerified: { type: Boolean, default: false },
    rawProfile: { type: Object },

    currentLocation: locationSchema,
    isLogin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    currentDevice: { type: String },
    loginHistory: [loginHistorySchema],
  },
  { timestamps: true }
);

// ---------------- Password Hashing ----------------
// Only hash if provider is local AND password is modified
customerSchema.pre("save", async function (next) {
  if (!this.isModified("password") || this.provider !== "local") return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ---------------- Password Verification ----------------
customerSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Customer", customerSchema);
