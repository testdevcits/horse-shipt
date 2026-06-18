const { apiResponse } = require("../../responses/api.response");
const ShipmentMessage = require("../../models/ShipmentMessage");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const { emitToUser } = require("../../sockets/realtimeSocket");

// ----------------------------------------------------
// Customer Send Message
// ----------------------------------------------------
exports.sendMessage = async (req, res) => {
  try {
    const { shipmentId, message } = req.body;
    const customerId = req.user._id;

    if (!shipmentId || !message) {
      return res.status(400).json({
        success: false,
        message: apiResponse.SHIPMENT_ID_AND_MESSAGE_ARE_REQUIRED,
      });
    }

    const shipment = await CustomerShipment.findById(shipmentId)
      .populate("customer", "_id name")
      .populate("shipper", "_id name");

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND_2,
      });
    }

    if (shipment.customer._id.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: apiResponse.YOU_CAN_ONLY_SEND_MESSAGES_FOR_YOUR_OWN_SHIPMENTS,
      });
    }

    const newMessage = new ShipmentMessage({
      shipment: shipment._id,
      senderType: "customer",
      senderId: customerId,
      customer: shipment.customer._id,
      shipper: shipment.shipper ? shipment.shipper._id : null,
      message,
    });

    await newMessage.save();

    if (shipment.shipper?._id) {
      emitToUser(req.app.get("io"), {
        role: "shipper",
        userId: shipment.shipper._id,
        event: "horse_shipt:shipment_message_created",
        payload: newMessage,
        notification: {
          type: "shipment_message",
          title: "New shipment message",
          message: `${shipment.customer.name || "A customer"} sent a shipment message.`,
        },
      });
    }

    return res.status(201).json({
      success: true,
      message: apiResponse.MESSAGE_SENT_SUCCESSFULLY,
      data: newMessage,
    });
  } catch (error) {
    console.error("Customer message error:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_WHILE_SENDING_MESSAGE,
      error: error.message,
    });
  }
};

// ----------------------------------------------------
// Get Messages for a Shipment
// ----------------------------------------------------
exports.getMessages = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const customerId = req.user._id;

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPMENT_NOT_FOUND_2 });
    }

    if (shipment.customer.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: apiResponse.YOU_ARE_NOT_AUTHORIZED_TO_VIEW_THESE_MESSAGES,
      });
    }

    const messages = await ShipmentMessage.find({ shipment: shipmentId })
      .populate("customer", "name email")
      .populate("shipper", "name email")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Get customer messages error:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_WHILE_FETCHING_MESSAGES,
      error: error.message,
    });
  }
};
