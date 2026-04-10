const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    shipperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
    },

    stripeCustomerId: {
      type: String,
      required: true,
    },

    stripeSubscriptionId: {
      type: String,
      required: true,
    },

    stripePriceId: {
      type: String,
      required: true,
    },

    planName: {
      type: String,
      default: "Horse Shipt Premium",
    },
    planType: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
    },
    amount: Number,
    currency: { type: String, default: "usd" },
    interval: String,

    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "canceled", "incomplete"],
      default: "incomplete",
    },

    // ============================
    // TRIAL
    // ============================
    trialStart: Date,
    trialEnd: Date,

    // ============================
    // BILLING
    // ============================
    currentPeriodStart: Date,
    currentPeriodEnd: Date,

    lastPaymentDate: Date,
    nextBillingDate: Date,

    // ============================
    // CANCEL
    // ============================
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },

    canceledAt: Date,
    cancelReason: String,

    cancelScheduledAt: Date,

    // ============================
    // FAILURE TRACKING
    // ============================
    lastPaymentFailure: Date,
    failureReason: String,

    // ============================
    // METADATA (ADMIN USE)
    // ============================
    metadata: {
      email: String,
      name: String,
      plan: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
