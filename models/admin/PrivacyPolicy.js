const mongoose = require("mongoose");

const PrivacyPolicySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      default: "Privacy Policy",
    },
    content: {
      type: String,
      required: true,
      default: "TBD",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PrivacyPolicy", PrivacyPolicySchema);
