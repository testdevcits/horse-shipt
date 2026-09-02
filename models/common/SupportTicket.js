const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderRole: {
      type: String,
      enum: ["customer", "shipper", "admin"],
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "messages.senderModel",
    },
    senderModel: {
      type: String,
      enum: ["Customer", "Shipper", "HorseAdmin"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    requesterRole: {
      type: String,
      enum: ["customer", "shipper"],
      required: true,
      index: true,
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "requesterModel",
      index: true,
    },
    requesterModel: {
      type: String,
      enum: ["Customer", "Shipper"],
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    category: {
      type: String,
      trim: true,
      default: "General",
      maxlength: 60,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HorseAdmin",
      default: null,
    },
    messages: [messageSchema],
  },
  { timestamps: true }
);

supportTicketSchema.index({
  requesterRole: 1,
  status: 1,
  lastMessageAt: -1,
});

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
