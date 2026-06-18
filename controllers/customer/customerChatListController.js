const { apiResponse } = require("../../responses/api.response");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const formatChatUser = require("../../utils/formatChatUser");

const CHAT_ALLOWED_STATUSES = ["assigned", "picked", "in_transit"];

/**
 * Fetch accepted shipment chats for the customer
 */
exports.getShippersForChat = async (req, res) => {
  try {
    const shipments = await CustomerShipment.find({
      customer: req.user._id,
      shipper: { $ne: null },
      status: { $in: CHAT_ALLOWED_STATUSES },
    })
      .select(
        "_id shipmentCode status pickupLocation deliveryLocation shipper updatedAt"
      )
      .populate(
        "shipper",
        "_id name email profileImage profilePicture isLogin isActive"
      )
      .sort({ updatedAt: -1 });

    const formattedShippers = shipments
      .filter((shipment) => shipment.shipper)
      .map((shipment) => {
        const shipper = shipment.shipper;
      const formatted = formatChatUser(shipper, "shipper");

      return {
        ...formatted,
        isOnline: Boolean(shipper.isLogin),
          shipmentId: shipment._id,
          shipmentCode: shipment.shipmentCode,
          shipmentStatus: shipment.status,
          pickupLocation: shipment.pickupLocation,
          deliveryLocation: shipment.deliveryLocation,
          chatTitle: `${shipment.shipmentCode || "Shipment"} - ${
            shipper.name || "Shipper"
          }`,
      };
      });

    res.status(200).json({
      success: true,
      data: formattedShippers,
    });
  } catch (error) {
    console.error("Get shippers for chat error:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_SHIPPERS_FOR_CHAT,
    });
  }
};
