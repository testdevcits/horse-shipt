const mongoose = require("mongoose");

const customerQuoteSchema = new mongoose.Schema(
  {
    // ================= RELATIONS =================
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      required: true,
      index: true,
    },

    shipperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipper",
      required: true,
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShipperVehicle",
    },

    // ================= SNAPSHOT DATA =================
    shipperInfo: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
      companyName: { type: String },
    },

    vehicleInfo: {
      vehicleNumber: { type: String },
      type: { type: String },
      capacity: { type: Number },
    },

    // ================= PRICING =================
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank"],
    },
    paymentDue: {
      type: String,
      enum: ["pickup", "delivery"],
    },

    // ================= MESSAGE =================
    message: {
      type: String,
      trim: true,
      default: "",
    },

    // ================= DELIVERY =================
    estimatedDeliveryDays: {
      type: Number,
      min: 0,
    },

    // ================= STATUS =================
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },

    // ================= CONTRACT PDF =================
    contract: {
      url: { type: String, default: null },
      public_id: { type: String, default: null },
    },

    // ================= SIGNED CONTRACT =================
    signedContract: {
      url: { type: String, default: null },
      public_id: { type: String, default: null },
    },

    // ================= DIGITAL SIGNATURES =================
    shipperSignature: { type: String, default: null }, // Cloudinary URL or base64
    customerSignature: { type: String, default: null }, // Cloudinary URL

    contractAccepted: { type: Boolean, default: false },
    contractAcceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ================= INDEXES =================
// Prevent same shipper sending multiple quotes for same shipment
customerQuoteSchema.index({ shipmentId: 1, shipperId: 1 }, { unique: true });

// ================= VALIDATION =================
// Prevent acceptance without customer signature
customerQuoteSchema.pre("save", function (next) {
  if (this.contractAccepted && !this.customerSignature) {
    return next(
      new Error("Customer signature is required to accept the contract")
    );
  }
  next();
});

module.exports = mongoose.model("CustomerQuote", customerQuoteSchema);
