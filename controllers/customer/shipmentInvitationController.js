const Invitation = require("../../models/common/ShipmentInvitation");
const Shipment = require("../../models/customer/CustomerShipment");

exports.sendInvitation = async (req, res) => {
  try {
    const { shipmentId, shipperId } = req.body;

    if (!shipmentId || !shipperId) {
      return res.status(400).json({
        success: false,
        message: "shipmentId and shipperId required",
      });
    }

    const shipment = await Shipment.findById(shipmentId).lean();

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // prevent duplicate
    const existing = await Invitation.findOne({
      shipment: shipmentId,
      shipper: shipperId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Already invited",
      });
    }

    const invitation = await Invitation.create({
      shipment: shipmentId,
      customer: req.user.id,
      shipper: shipperId,

      // snapshot
      shipmentCode: shipment.shipmentCode,
      pickupLocation: shipment.pickupLocation,
      deliveryLocation: shipment.deliveryLocation,
    });

    return res.json({
      success: true,
      message: "Invitation sent",
      data: invitation,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Invitation already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
