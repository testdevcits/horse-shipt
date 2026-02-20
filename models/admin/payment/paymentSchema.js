const paymentSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Shipment" },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  shipperId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  stripePaymentIntentId: String,

  totalAmount: Number,
  commissionAmount: Number,
  payoutAmount: Number,

  status: {
    type: String,
    enum: ["created", "authorized", "captured", "released", "refunded"],
    default: "created",
  },

  createdAt: { type: Date, default: Date.now },
  paidAt: Date,
  releasedAt: Date,
});
