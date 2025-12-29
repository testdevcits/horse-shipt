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

    // ================= VEHICLE =================
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShipperVehicle",
    },

    vehicleNumber: {
      type: String, // store vehicle number as string
      default: null,
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

    // ================= TIMING =================
    pickupTime: {
      type: String, // "HH:mm"
    },

    estimatedArrivalTime: {
      type: String, // "HH:mm"
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

    shipperSignature: {
      type: String,
      default: null, // base64 or URL
    },

    customerSignature: {
      type: String,
      default: null, // base64 or URL
    },

    contractAccepted: {
      type: Boolean,
      default: false,
    },

    contractAcceptedAt: {
      type: Date,
      default: null,
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
// Prevent same shipper from sending multiple offers for same shipment
quoteSchema.index({ shipment: 1, shipper: 1 }, { unique: true });

// Fast customer quote listing
quoteSchema.index({ shipment: 1, status: 1 });

// ================= MIDDLEWARE =================
quoteSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status !== "pending") {
    this.isActive = false;
  }
  next();
});

module.exports = mongoose.model("ShipmentQuote", quoteSchema);
