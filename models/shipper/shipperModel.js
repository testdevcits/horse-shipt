const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const shipperSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, default: "shipper" },
    provider: { type: String }, // 'google' or 'facebook'
    providerId: { type: String }, // OAuth provider ID
  },
  { timestamps: true }
);

// Hash password before saving (only if modified)
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
