// models/OAuthUser.js
const mongoose = require("mongoose");

const OAuthUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    role: { type: String, enum: ["shipper", "customer"], required: true },
    provider: { type: String, default: "google" },
    providerId: { type: String, required: true },
    name: { type: String },
    profilePicture: { type: String },
    lastLoginAt: { type: Date, default: Date.now },
    currentDevice: { type: String, default: null },
    isLogin: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OAuthUser", OAuthUserSchema);
