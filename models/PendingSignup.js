const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const pendingSignupSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["customer", "shipper"],
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      enum: ["local"],
      default: "local",
    },
    deviceId: {
      type: String,
      default: null,
    },
    currentLocation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    otpHash: {
      type: String,
      required: true,
    },
    otpExpiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

pendingSignupSchema.index({ email: 1, role: 1 }, { unique: true });
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

pendingSignupSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(this.password);
    if (!isBcryptHash) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("PendingSignup", pendingSignupSchema);
