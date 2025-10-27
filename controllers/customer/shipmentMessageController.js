const ShipmentMessage = require("../../models/ShipmentMessage");
const CustomerShipment = require("../../models/customer/CustomerShipment");

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
        message: "Shipment ID and message are required.",
      });
    }

    const shipment = await CustomerShipment.findById(shipmentId)
      .populate("customer", "_id name")
      .populate("shipper", "_id name");

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found.",
      });
    }

    if (shipment.customer._id.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only send messages for your own shipments.",
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

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: newMessage,
    });
  } catch (error) {
    console.error("Customer message error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while sending message.",
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
        .json({ success: false, message: "Shipment not found." });
    }

    if (shipment.customer.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view these messages.",
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
      message: "Server error while fetching messages.",
      error: error.message,
    });
  }
};
