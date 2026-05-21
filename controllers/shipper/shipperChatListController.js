const CustomerShipment = require("../../models/customer/CustomerShipment");
const formatChatUser = require("../../utils/formatChatUser");

const CHAT_ALLOWED_STATUSES = ["assigned", "picked", "in_transit"];

/**
 * Shipper → accepted shipment chats
 */
exports.getCustomersForChat = async (req, res) => {
  try {
    const shipments = await CustomerShipment.find({
      shipper: req.user._id,
      customer: { $ne: null },
      status: { $in: CHAT_ALLOWED_STATUSES },
    })
      .select(
        "_id shipmentCode status pickupLocation deliveryLocation customer updatedAt"
      )
      .populate("customer", "_id name email profileImage profilePicture isLogin")
      .sort({ updatedAt: -1 });

    const formattedCustomers = shipments
      .filter((shipment) => shipment.customer)
      .map((shipment) => {
        const customer = shipment.customer;
        const formatted = formatChatUser(customer, "customer");

        return {
          ...formatted,
          isOnline: Boolean(customer.isLogin),
          shipmentId: shipment._id,
          shipmentCode: shipment.shipmentCode,
          shipmentStatus: shipment.status,
          pickupLocation: shipment.pickupLocation,
          deliveryLocation: shipment.deliveryLocation,
          chatTitle: `${shipment.shipmentCode || "Shipment"} - ${
            customer.name || "Customer"
          }`,
        };
      });

    res.status(200).json({
      success: true,
      data: formattedCustomers,
    });
  } catch (error) {
    console.error("Get customers for chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customers for chat",
    });
  }
};
