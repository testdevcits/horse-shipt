const ShipmentMessage = require("../../models/ShipmentMessage");
const CustomerShipment = require("../../models/shipper/ShipperShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const { sendShipperEmail } = require("../../utils/shipperMailSend");
const { sendShipperSms } = require("../../utils/shipperSmsSend");

// ----------------------------------------------------
// Shipper Send Message
// ----------------------------------------------------
exports.sendMessage = async (req, res) => {
  try {
    const { shipmentId, message } = req.body;
    const shipperId = req.user._id;

    if (!shipmentId || !message) {
      return res.status(400).json({
        success: false,
        message: "Shipment ID and message are required.",
      });
    }

    const shipment = await CustomerShipment.findById(shipmentId)
      .populate("customer", "_id name email phone")
      .populate("shipper", "_id name email phone");

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found.",
      });
    }

    if (
      !shipment.shipper ||
      shipment.shipper._id.toString() !== shipperId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only message shipments assigned to you.",
      });
    }

    // Create and save message
    const newMessage = new ShipmentMessage({
      shipment: shipment._id,
      senderType: "shipper",
      senderId: shipperId,
      customer: shipment.customer._id,
      shipper: shipment.shipper._id,
      message,
    });

    await newMessage.save();

    // ------------------------------------------------
    // 🔔 Send Notification (Based on Shipper Settings)
    // ------------------------------------------------
    const settings = await ShipperSettings.findOne({ shipperId });

    if (settings && settings.notifications?.message) {
      const notif = settings.notifications.message;

      if (notif.email) {
        await sendShipperEmail(
          shipperId,
          "New Message Sent",
          `You sent a message to ${shipment.customer.name}: "${message}"`
        );
      }

      if (notif.sms) {
        await sendShipperSms(
          shipperId,
          `You sent a message to ${shipment.customer.name}: "${message}"`
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: newMessage,
    });
  } catch (error) {
    console.error("Shipper message error:", error);
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
    const shipperId = req.user._id;

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found." });
    }

    if (
      !shipment.shipper ||
      shipment.shipper.toString() !== shipperId.toString()
    ) {
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
    console.error("Get shipper messages error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching messages.",
      error: error.message,
    });
  }
};
