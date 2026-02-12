const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const horseAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    role: {
      type: String,
      enum: ["admin", "super-admin"],
      default: "admin",
    },

    otp: {
      type: String,
    },

    otpExpire: {
      type: Date,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

horseAdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

horseAdminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

horseAdminSchema.methods.generateOtp = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  this.otp = crypto.createHash("sha256").update(otp).digest("hex");

  this.otpExpire = Date.now() + 5 * 60 * 1000; // 5 minutes

  return otp; // plain OTP (send via email/SMS)
};

horseAdminSchema.methods.clearOtp = function () {
  this.otp = undefined;
  this.otpExpire = undefined;
};

module.exports = mongoose.model("HorseAdmin", horseAdminSchema);
