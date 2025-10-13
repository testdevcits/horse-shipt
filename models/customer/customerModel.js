const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, default: "customer" },

    // OAuth provider info
    provider: { type: String },
    providerId: { type: String },
    profilePicture: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    locale: { type: String },
    emailVerified: { type: Boolean, default: false },
    rawProfile: { type: Object },

    // Login control
    isLogin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    currentDevice: { type: String },
  },
  { timestamps: true }
);

// Hash password before saving
customerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Password verification
customerSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

const Customer = mongoose.model("Customer", customerSchema);
module.exports = Customer;
