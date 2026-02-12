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
      select: false, // don't return password by default
    },

    role: {
      type: String,
      enum: ["admin", "super-admin"],
      default: "admin",
    },

    otp: {
      type: String, // store hashed OTP
    },

    otpExpire: {
      type: Date, // OTP expiry timestamp
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
    timestamps: true, // adds createdAt and updatedAt
  }
);

// ===========================
// HASH PASSWORD BEFORE SAVE
// ===========================
horseAdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// ===========================
// PASSWORD COMPARISON METHOD
// ===========================
horseAdminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ===========================
// GENERATE 6-DIGIT OTP
// ===========================
horseAdminSchema.methods.generateOtp = function () {
  // Generate a 6-digit numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash OTP before storing in DB
  this.otp = crypto.createHash("sha256").update(otp).digest("hex");

  // OTP valid for 5 minutes
  this.otpExpire = Date.now() + 5 * 60 * 1000;

  return otp; // return plain OTP to send via email
};

// ===========================
// CLEAR OTP AFTER USE
// ===========================
horseAdminSchema.methods.clearOtp = function () {
  this.otp = undefined;
  this.otpExpire = undefined;
};

module.exports = mongoose.model("HorseAdmin", horseAdminSchema);
