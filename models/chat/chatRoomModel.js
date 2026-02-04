const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema(
  {
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

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
