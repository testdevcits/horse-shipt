const mongoose = require("mongoose");

const quoteSchema = new mongoose.Schema(
  {
    // ================= RELATIONS =================
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
      index: true,
    },

    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      index: true,
    },

    // ================= CONTRACT ID =================
    contractId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ================= VEHICLE =================
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShipperVehicle",
    },

    // ================= PRICING =================
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "USD",
    },

    // ================= PAYMENT =================
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank"],
    },

    paymentDue: {
      type: String,
      enum: ["pickup", "delivery"],
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
      index: true,
    },

    stripePaymentIntentId: {
      type: String,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    // ================= PAYOUT / PAYMENT RELEASE =================
    stripeTransferId: {
      type: String,
      default: null,
    },

    payoutStatus: {
      type: String,
      enum: ["pending", "transferred"],
      default: "pending",
      index: true,
    },

    paymentReleasedAt: {
      type: Date,
      default: null,
    },

    // ================= WALLET / PLATFORM FEE =================
    balanceInWallet: {
      type: Number,
      default: 0,
      min: 0,
    },

    platformFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ================= TIMING =================
    pickupTime: {
      type: String,
    },

    estimatedArrivalTime: {
      type: String,
    },

    estimatedDeliveryDays: {
      type: Number,
      min: 0,
    },

    // ================= TRANSPORT DETAILS =================
    transportType: {
      type: String,
      enum: ["trailer", "truck", "Trucking"],
      default: null,
    },

    stallsRequired: {
      type: Number,
      min: 1,
      default: null,
    },

    // ================= MESSAGE =================
    notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    // ================= STATUS =================
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired"],
      default: "pending",
      index: true,
    },

    // ================= CUSTOMER TERMS =================
    termsAccepted: {
      type: Boolean,
      default: false,
    },

    // ================= CONTRACT & SIGNATURES =================
    contract: {
      url: { type: String, default: null },
      public_id: { type: String, default: null },
    },

    shipperContract: {
      url: { type: String, default: null },
      public_id: { type: String, default: null },
      originalName: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      uploadedAt: { type: Date, default: null },
    },

    shipperSignature: {
      type: String,
      default: null,
    },

    customerSignature: {
      type: String,
      default: null,
    },

    contractAccepted: {
      type: Boolean,
      default: false,
    },

    contractAcceptedAt: {
      type: Date,
      default: null,
    },

    // ================= DRIVER & TRACKING =================

    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
      index: true,
    },

    tripStatus: {
      type: String,
      enum: ["notStarted", "started", "inTransit", "completed"],
      default: "notStarted",
      index: true,
    },

    isTrackingActive: {
      type: Boolean,
      default: false,
    },

    currentLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },

    tripStartedAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },
    // ================= CANCELLATION =================
    cancellationWindowDays: {
      type: Number,
      required: true,
      min: 0,
    },

    cancellationLastDate: {
      type: Date,
      required: true,
    },

    isCancelled: {
      type: Boolean,
      default: false,
      index: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelReason: {
      type: String,
      default: "",
    },

    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    cancellationChargeId: String,
    refundId: String,
    cancellationFee: Number,
    refundStatus: {
      type: String,
      enum: ["pending", "processed", "failed", "not_required"],
      default: "pending",
    },

    // ================= META =================
    isActive: {
      type: Boolean,
      default: true,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },

  { timestamps: true }
);

// ================= INDEXES =================
quoteSchema.index({ shipment: 1, shipper: 1 }, { unique: true });
quoteSchema.index({ shipment: 1, status: 1 });

// ================= MIDDLEWARE =================
quoteSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status !== "pending") {
    this.isActive = false;
  }
  next();
});

module.exports = mongoose.model("ShipmentQuote", quoteSchema);
