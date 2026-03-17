const mongoose = require("mongoose");

const TermsConditionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "Terms & Conditions",
    },
    content: {
      type: String,
      trim: true,
      default: "TBD",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TermsCondition", TermsConditionSchema);
