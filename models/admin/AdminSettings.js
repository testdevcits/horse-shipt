const mongoose = require("mongoose");

const adminSettingsSchema = new mongoose.Schema(
  {
    notificationEnabled: {
      type: Boolean,
      default: true,
    },
    notifications: {
      inApp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminSettings", adminSettingsSchema);
