const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerShipment",
      default: null,
      index: true,
    },

    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          refPath: "participants.role",
        },
        role: {
          type: String,
          enum: ["customer", "shipper"],
          required: true,
        },
      },
    ],

    lastMessage: {
      type: String,
      default: "",
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

chatRoomSchema.index({ shipment: 1, "participants.userId": 1 });

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
