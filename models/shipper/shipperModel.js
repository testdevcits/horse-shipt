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

// Cloudinary Image Schema
const imageSchema = new mongoose.Schema({
  url: { type: String, default: null },
  public_id: { type: String, default: null },
});

// -------------------------
// Main Shipper Schema
// -------------------------
const shipperSchema = new mongoose.Schema(
  {
    uniqueId: { type: String, required: true, unique: true },

    // Basic Info
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String },

    // Role
    role: { type: String, default: "shipper" },

    // OAuth (Google)
    provider: { type: String, enum: ["local", "google"], default: "local" },
    providerId: { type: String },
    profilePicture: { type: String },

    // Uploaded images via Cloudinary
    profileImage: imageSchema,
    bannerImage: imageSchema,

    // Extra Info
    firstName: { type: String },
    lastName: { type: String },
    locale: { type: String },
    emailVerified: { type: Boolean, default: false },
    rawProfile: { type: Object },
    mobile: {
      type: String,
      required: false, // not required for any user
    },

    locale: {
      address: { type: String, default: "" },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },

    // Description (NEW)
    description: {
      type: String,
      default: "",
    },

    // Location (Live Tracking)
    currentLocation: locationSchema,

    // Login Control
    isLogin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    currentDevice: { type: String },
    // Google Review Link
    googleReviewLink: {
      type: String,
      default: null,
    },
    stripeAccountId: {
      type: String,
      default: null,
    },

    stripeVerified: {
      type: Boolean,
      default: false,
    },

    stripeOnboardingCompleted: {
      type: Boolean,
      default: false,
    },

    stripeChargesEnabled: {
      type: Boolean,
      default: false,
    },

    stripePayoutsEnabled: {
      type: Boolean,
      default: false,
    }, // ================================
    // STRIPE CUSTOMER (FOR CARD)
    // ================================
    stripeCustomerId: {
      type: String,
      default: null,
    },

    paymentMethodId: {
      type: String,
      default: null,
    },

    cardLast4: {
      type: String,
      default: null,
    },

    cardBrand: {
      type: String,
      default: null,
    },

    cardExpMonth: {
      type: Number,
      default: null,
    },

    cardExpYear: {
      type: Number,
      default: null,
    },

    // ================================
    // ACCOUNT STATUS (GREY-OUT MODE)
    // ================================
    accountStatus: {
      type: String,
      enum: ["ACTIVE", "RESTRICTED"],
      default: "ACTIVE",
    },

    // ================================
    // PAYMENT FAILURE TRACKING
    // ================================
    lastPaymentFailure: {
      type: Date,
      default: null,
    },

    paymentFailureReason: {
      type: String,
      default: null,
    },
    // Login History
    loginHistory: [loginHistorySchema],
  },
  { timestamps: true }
);

// -------------------------
// Password Hashing
// -------------------------
shipperSchema.pre("save", async function (next) {
  // Skip hashing if password NOT modified OR provider is google
  if (!this.isModified("password") || this.provider === "google") {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// -------------------------
// Password Verification Method
// -------------------------
shipperSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false; // google accounts have no password
  return await bcrypt.compare(enteredPassword, this.password);
};

// -------------------------
// Export Model
// -------------------------
module.exports = mongoose.model("Shipper", shipperSchema);
