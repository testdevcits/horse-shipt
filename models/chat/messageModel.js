const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    senderRole: {
      type: String,
      enum: ["customer", "shipper"],
      required: true,
    },

    message: {
      type: String,
      default: "",
      trim: true,
    },

    media: [
      {
        type: {
          type: String,
          enum: ["image"],
          required: true,
        },
        url: { type: String, required: true },
        public_id: { type: String, required: true },
        mimeType: { type: String, default: "image/jpeg" },
        originalName: { type: String, default: "" },
        size: { type: Number, default: 0 },
      },
    ],

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
