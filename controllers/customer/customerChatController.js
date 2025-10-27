const Pusher = require("pusher");
const ChatMessage = require("../../models/customer/CustomerShipmentChat");

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

// ---------------- Send Message ----------------
exports.sendMessage = async (req, res) => {
  try {
    const { shipmentId, message } = req.body;
    const senderId = req.user._id;
    const senderModel = "Customer"; // always customer for this controller

    if (!message || !shipmentId)
      return res.status(400).json({ success: false, message: "Invalid data" });

    const newMessage = await ChatMessage.create({
      shipment: shipmentId,
      sender: senderId,
      senderModel,
      message,
    });

    // Trigger real-time update via Pusher
    await pusher.trigger(`shipment-${shipmentId}`, "new-message", {
      _id: newMessage._id,
      sender: senderId,
      senderModel,
      message,
      createdAt: newMessage.createdAt,
    });

    res.status(201).json({ success: true, message: newMessage });
  } catch (err) {
    console.error("Chat sendMessage error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ---------------- Get Messages ----------------
exports.getMessages = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    if (!shipmentId)
      return res
        .status(400)
        .json({ success: false, message: "Shipment ID required" });

    const messages = await ChatMessage.find({ shipment: shipmentId }).sort({
      createdAt: 1,
    });
    res.status(200).json({ success: true, messages });
  } catch (err) {
    console.error("Chat getMessages error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
