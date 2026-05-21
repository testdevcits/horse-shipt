const sharp = require("sharp");
const streamifier = require("streamifier");
const ChatRoom = require("../../models/chat/chatRoomModel");
const Message = require("../../models/chat/messageModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const cloudinary = require("../../utils/cloudinary");
const { getOrCreateChatRoom } = require("./chatController");
const { emitToUser } = require("../../sockets/realtimeSocket");
const { notifyChatReceiver } = require("../../utils/chatNotificationService");

const CHAT_ALLOWED_STATUSES = ["assigned", "picked", "in_transit"];

const inferRole = (req) => {
  if (req.user?.role) return req.user.role;
  if (req.originalUrl?.includes("/shipper/")) return "shipper";
  return "customer";
};

const getParticipantIds = (req) => {
  const role = inferRole(req);
  const userId = req.user?._id;
  const shipmentId =
    req.body.shipmentId || req.query.shipmentId || req.params.shipmentId;
  const customerId =
    role === "customer" ? userId : req.body.customerId || req.query.customerId;
  const shipperId =
    role === "shipper" ? userId : req.body.shipperId || req.query.shipperId;

  return { role, userId, shipmentId, customerId, shipperId };
};

const ensureRoomParticipant = async ({ roomId, userId, role }) => {
  const room = await ChatRoom.findById(roomId).lean();
  if (!room) return null;

  const isParticipant = room.participants.some(
    (participant) =>
      participant.userId.toString() === userId.toString() &&
      participant.role === role
  );

  return isParticipant ? room : null;
};

const canChatOnShipment = (shipment) =>
  Boolean(
    shipment?.shipper &&
      shipment?.customer &&
      CHAT_ALLOWED_STATUSES.includes(shipment.status)
  );

const getChatShipment = async ({ shipmentId, userId, role }) => {
  if (!shipmentId) {
    const error = new Error("shipmentId is required to open chat.");
    error.statusCode = 400;
    throw error;
  }

  const shipment = await CustomerShipment.findById(shipmentId)
    .populate("customer", "_id name email profileImage profilePicture isLogin")
    .populate("shipper", "_id name email profileImage profilePicture isLogin");

  if (!shipment) {
    const error = new Error("Shipment not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!canChatOnShipment(shipment)) {
    const error = new Error(
      shipment?.status === "delivered"
        ? "Chat is locked after shipment completion."
        : "Chat is available only after the shipment is accepted."
    );
    error.statusCode = 403;
    throw error;
  }

  const customerId = shipment.customer?._id || shipment.customer;
  const shipperId = shipment.shipper?._id || shipment.shipper;
  const allowed =
    (role === "customer" && customerId?.toString() === userId.toString()) ||
    (role === "shipper" && shipperId?.toString() === userId.toString());

  if (!allowed) {
    const error = new Error("You are not authorized to open this shipment chat.");
    error.statusCode = 403;
    throw error;
  }

  return { shipment, customerId, shipperId };
};

const uploadChatImage = async (file) => {
  if (!file) return null;

  const compressedBuffer = await sharp(file.buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();

  const uploaded = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "chat_media", resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );

    streamifier.createReadStream(compressedBuffer).pipe(uploadStream);
  });

  return {
    type: "image",
    url: uploaded.secure_url,
    public_id: uploaded.public_id,
    mimeType: "image/jpeg",
    originalName: file.originalname || "",
    size: compressedBuffer.length,
  };
};

exports.getOrCreateRoom = async (req, res) => {
  try {
    const { role, userId, shipmentId } = getParticipantIds(req);
    const { shipment, customerId, shipperId } = await getChatShipment({
      shipmentId,
      userId,
      role,
    });

    if (!customerId || !shipperId) {
      return res.status(400).json({
        success: false,
        message: "Shipment customer and shipper are required.",
      });
    }

    const room = await getOrCreateChatRoom({
      customerId,
      shipperId,
      shipmentId,
    });

    return res.status(200).json({
      success: true,
      room,
      roomId: room._id,
      shipment: {
        _id: shipment._id,
        shipmentCode: shipment.shipmentCode,
        status: shipment.status,
        pickupLocation: shipment.pickupLocation,
        deliveryLocation: shipment.deliveryLocation,
      },
    });
  } catch (error) {
    console.error("getOrCreateRoom error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to open chat room.",
    });
  }
};

exports.getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await ensureRoomParticipant({
      roomId,
      userId: req.user._id,
      role: inferRole(req),
    });

    if (!room) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this chat.",
      });
    }

    const messages = await Message.find({ chatRoom: roomId }).sort({
      createdAt: 1,
    });

    return res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("getRoomMessages error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load messages.",
    });
  }
};

exports.sendRoomMessage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const requestRole = inferRole(req);
    const messageText = (req.body.message || "").trim();
    const room = await ensureRoomParticipant({
      roomId,
      userId: req.user._id,
      role: requestRole,
    });

    if (!room) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to send messages in this chat.",
      });
    }

    if (room.shipment) {
      const shipment = await getChatShipment({
        shipmentId: room.shipment,
        userId: req.user._id,
        role: requestRole,
      });

      if (shipment.shipment?.status === "delivered") {
        return res.status(403).json({
          success: false,
          message: "Chat is locked after shipment completion.",
        });
      }
    }

    if (!messageText && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Message or image is required.",
      });
    }

    const mediaItem = req.file ? await uploadChatImage(req.file) : null;

    const chatMessage = await Message.create({
      chatRoom: roomId,
      senderId: req.user._id,
      senderRole: requestRole,
      message: messageText,
      media: mediaItem ? [mediaItem] : [],
    });

    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: messageText || "Image",
      lastMessageAt: new Date(),
    });

    const receiver = room.participants.find(
      (participant) =>
        participant.userId.toString() !== req.user._id.toString() ||
        participant.role !== requestRole
    );

    const io = req.app.get("io");
    if (io) {
      io.to(roomId).emit("receiveMessage", chatMessage);

      if (receiver) {
        emitToUser(io, {
          role: receiver.role,
          userId: receiver.userId,
          event: "horse_shipt:chat_message_created",
          payload: {
            message: chatMessage,
            shipmentId: room.shipment,
            customerId: room.customer,
            shipperId: room.shipper,
          },
          notification: {
            type: "chat_message",
            title: "New chat message",
            message:
              requestRole === "customer"
                ? "A customer sent you a message"
                : "A shipper sent you a message",
          },
        });
      }
    }

    if (receiver) {
      notifyChatReceiver({
        receiverRole: receiver.role,
        receiverId: receiver.userId,
        senderRole: requestRole,
        messageText: messageText || "Image",
        shipmentId: room.shipment,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: chatMessage,
    });
  } catch (error) {
    console.error("sendRoomMessage error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to send message.",
    });
  }
};
