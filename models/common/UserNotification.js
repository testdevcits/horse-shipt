const mongoose = require("mongoose");

const userNotificationSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["customer", "shipper", "admin", "super-admin"],
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    event: { type: String, default: "" },
    type: { type: String, default: "notification" },
    title: { type: String, default: "Notification" },
    message: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

userNotificationSchema.index({ role: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model("UserNotification", userNotificationSchema);
