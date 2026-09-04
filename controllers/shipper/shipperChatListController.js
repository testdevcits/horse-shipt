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

const buildChatItem = async ({ shipment, customer, quoteStatus }) => {
  const formatted = formatChatUser(customer, "customer");
  const isChatLocked = await getChatLockState(shipment);

  return {
    ...formatted,
    isOnline: Boolean(customer.isLogin),
    shipmentId: shipment._id,
    shipmentCode: shipment.shipmentCode,
    shipmentStatus: shipment.status,
    quoteStatus,
    isChatLocked,
    pickupLocation: shipment.pickupLocation,
    deliveryLocation: shipment.deliveryLocation,
    chatTitle: `${shipment.shipmentCode || "Shipment"} - ${
      customer.name || "Customer"
    }`,
  };
};

/**
 * Shipper -> accepted and quoted shipment chats.
 */
exports.getCustomersForChat = async (req, res) => {
  try {
    const byShipmentAndCustomer = new Map();
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

    const quotedShipments = await ShipmentQuote.find({
      shipper: req.user._id,
      status: { $in: ["pending", "accepted"] },
      isCancelled: { $ne: true },
    })
      .populate({
        path: "shipment",
        match: {
          customer: { $ne: null },
          status: { $in: CHAT_ALLOWED_STATUSES },
        },
        select: "_id shipmentCode status pickupLocation deliveryLocation customer updatedAt",
        populate: {
          path: "customer",
          select: "_id name email profileImage profilePicture isLogin",
        },
      })
      .sort({ updatedAt: -1 });

    const formattedCustomers = await Promise.all([
      ...shipments
        .filter((shipment) => shipment.customer)
        .map(async (shipment) => {
          const key = `${shipment._id}:${shipment.customer._id}`;
          byShipmentAndCustomer.set(key, true);
          return buildChatItem({ shipment, customer: shipment.customer });
        }),
      ...quotedShipments
        .filter((quote) => quote.shipment && quote.shipment.customer)
        .filter((quote) => {
          const key = `${quote.shipment._id}:${quote.shipment.customer._id}`;
          if (byShipmentAndCustomer.has(key)) return false;
          byShipmentAndCustomer.set(key, true);
          return true;
        })
        .map((quote) =>
          buildChatItem({
            shipment: quote.shipment,
            customer: quote.shipment.customer,
            quoteStatus: quote.status,
          })
        ),
    ]);

    res.status(200).json({
      success: true,
      data: formattedCustomers,
    });
  } catch (error) {
    console.error("Get customers for chat error:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_CUSTOMERS_FOR_CHAT,
    });
  }
};
