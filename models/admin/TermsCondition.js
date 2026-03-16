const mongoose = require("mongoose");

const TermsConditionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      default: "Terms & Conditions",
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

module.exports = mongoose.model("TermsCondition", TermsConditionSchema);
