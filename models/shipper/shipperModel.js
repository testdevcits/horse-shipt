const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const loginHistorySchema = new mongoose.Schema({
  deviceId: { type: String, default: null },
  ip: { type: String, default: null },
  loginAt: { type: Date, default: Date.now },
});

const shipperSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, default: "shipper" },

    // OAuth provider info
    provider: { type: String }, // 'google', 'facebook', 'apple'
    providerId: { type: String },
    profilePicture: { type: String }, // store profile image URL
    firstName: { type: String },
    lastName: { type: String },
    locale: { type: String },
    emailVerified: { type: Boolean, default: false },
    rawProfile: { type: Object },

    // Login control
    isLogin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    currentDevice: { type: String },

    // Login history
    loginHistory: [loginHistorySchema],
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

module.exports = mongoose.model("Shipper", shipperSchema);
