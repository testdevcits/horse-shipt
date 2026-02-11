const mongoose = require("mongoose");

const shipmentQuestionSchema = new mongoose.Schema(
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

    // ================= QUESTION =================

    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    // ================= ANSWER =================

    answer: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },

    answeredAt: {
      type: Date,
      default: null,
    },

    // ================= STATUS =================

    status: {
      type: String,
      enum: ["pending", "answered"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ================= INDEXES =================

shipmentQuestionSchema.index({ shipmentId: 1, shipperId: 1 }, { unique: true });

// ================= VALIDATION =================

shipmentQuestionSchema.pre("save", function (next) {
  if (this.status === "answered" && !this.answer) {
    return next(
      new Error("Answer is required before marking question as answered")
    );
  }
  next();
});

module.exports = mongoose.model("ShipmentQuestion", shipmentQuestionSchema);
