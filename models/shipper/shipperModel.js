const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const shipperSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, default: "shipper" },

    // OAuth provider info
    provider: { type: String }, // 'google', 'facebook', 'apple'
    providerId: { type: String }, // OAuth provider ID
    profilePicture: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    locale: { type: String },
    emailVerified: { type: Boolean, default: false },
    rawProfile: { type: Object },

    // Login control
    isLogin: { type: Boolean, default: false }, // user currently logged in?
    isActive: { type: Boolean, default: true }, // account active or blocked
    currentDevice: { type: String }, // optional: store device info
  },
  { timestamps: true }
);

// Hash password before saving
shipperSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Password verification
shipperSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

const Shipper = mongoose.model("Shipper", shipperSchema);
module.exports = Shipper;
