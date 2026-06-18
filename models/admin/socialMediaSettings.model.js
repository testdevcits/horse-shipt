const mongoose = require("mongoose");

const socialMediaSettingsSchema = new mongoose.Schema(
  {
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    twitter: { type: String, default: "" },
    youtube: { type: String, default: "" },
    linkedin: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "SocialMediaSettings",
  socialMediaSettingsSchema
);
