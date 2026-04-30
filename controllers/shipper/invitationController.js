const Invitation = require("../../models/common/ShipmentInvitation");

exports.getMyInvitations = async (req, res) => {
  try {
    const invites = await Invitation.find({
      shipper: req.user.id,
    })
      .populate({
        path: "shipment",
        select:
          "shipmentCode status pickupLocation deliveryLocation pickupDateRange deliveryDateRange horses numberOfHorses estimatedDistance transportType",
      })
      .populate({
        path: "customer",
        select: "name email",
      })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: invites.length,
      data: invites,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
