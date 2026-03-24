const express = require("express");
const router = express.Router();
const CustomerShipment = require("../../models/customer/CustomerShipment");

/**
 * GET shipment by invite token
 */
router.get("/invite/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const shipment = await CustomerShipment.findOne({
      inviteToken: token,
      inviteTokenExpiry: { $gt: new Date() }, // token not expired
    }).select("-recipientUser -__v"); // optional: exclude sensitive fields

    if (!shipment)
      return res
        .status(404)
        .json({
          message:
            "Link invalid or expired. Please sign up to access shipment.",
        });

    res.json({ shipment });
  } catch (err) {
    console.error("[INVITE SHIPMENT ERROR]", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
