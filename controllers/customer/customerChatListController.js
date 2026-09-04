const { apiResponse } = require("../../responses/api.response");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const formatChatUser = require("../../utils/formatChatUser");

const CHAT_ALLOWED_STATUSES = [
  "open_for_offers",
  "assigned",
  "picked",
  "in_transit",
  "delivered",
  "completed",
];

const getChatLockState = async (shipment) => {
  if (["delivered", "completed"].includes(shipment.status)) return true;

  const quote = await ShipmentQuote.findOne({
    shipment: shipment._id,
    status: "accepted",
  })
    .select("tripStatus deliveredAt taxInvoices payoutStatus")
    .lean();

  return Boolean(
    quote?.tripStatus === "completed" ||
      quote?.deliveredAt ||
      quote?.taxInvoices?.shipper?.url ||
      quote?.taxInvoices?.customer?.url ||
      quote?.payoutStatus === "transferred"
  );
};

const buildChatItem = async ({ shipment, shipper, quoteStatus }) => {
  const formatted = formatChatUser(shipper, "shipper");
  const isChatLocked = await getChatLockState(shipment);

  return {
    ...formatted,
    isOnline: Boolean(shipper.isLogin),
    shipmentId: shipment._id,
    shipmentCode: shipment.shipmentCode,
    shipmentStatus: shipment.status,
    quoteStatus,
    isChatLocked,
    pickupLocation: shipment.pickupLocation,
    deliveryLocation: shipment.deliveryLocation,
    chatTitle: `${shipment.shipmentCode || "Shipment"} - ${
      shipper.name || "Shipper"
    }`,
  };
};

/**
 * Fetch accepted and quoted shipment chats for the customer.
 */
exports.getShippersForChat = async (req, res) => {
  try {
    const byShipmentAndShipper = new Map();
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

    const quotedShipments = await ShipmentQuote.find({
      status: { $in: ["pending", "accepted"] },
      isCancelled: { $ne: true },
    })
      .populate({
        path: "shipment",
        match: {
          customer: req.user._id,
          status: { $in: CHAT_ALLOWED_STATUSES },
        },
        select: "_id shipmentCode status pickupLocation deliveryLocation customer updatedAt",
      })
      .populate(
        "shipper",
        "_id name email profileImage profilePicture isLogin isActive"
      )
      .sort({ updatedAt: -1 });

    const formattedShippers = await Promise.all([
      ...shipments
        .filter((shipment) => shipment.shipper)
        .map(async (shipment) => {
          const key = `${shipment._id}:${shipment.shipper._id}`;
          byShipmentAndShipper.set(key, true);
          return buildChatItem({ shipment, shipper: shipment.shipper });
        }),
      ...quotedShipments
        .filter((quote) => quote.shipment && quote.shipper)
        .filter((quote) => {
          const key = `${quote.shipment._id}:${quote.shipper._id}`;
          if (byShipmentAndShipper.has(key)) return false;
          byShipmentAndShipper.set(key, true);
          return true;
        })
        .map((quote) =>
          buildChatItem({
            shipment: quote.shipment,
            shipper: quote.shipper,
            quoteStatus: quote.status,
          })
        ),
    ]);

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
