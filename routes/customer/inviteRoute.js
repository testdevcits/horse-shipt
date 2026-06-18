const { apiResponse } = require("../../responses/api.response");
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
      inviteTokenExpiry: { $gt: new Date() },
    }).select("-recipientUser -__v");

    if (!shipment)
      return res.status(404).json({
        message: apiResponse.LINK_INVALID_OR_EXPIRED_PLEASE_SIGN_UP_TO_ACCESS_SHIPMENT,
      });

    res.json({ shipment });
  } catch (err) {
    console.error("[INVITE SHIPMENT ERROR]", err);
    res.status(500).json({ message: apiResponse.SERVER_ERROR });
  }
});

module.exports = router;
