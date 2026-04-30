const sharp = require("sharp");
const streamifier = require("streamifier");
const ChatRoom = require("../../models/chat/chatRoomModel");
const Message = require("../../models/chat/messageModel");
const cloudinary = require("../../utils/cloudinary");
const { getOrCreateChatRoom } = require("./chatController");
const { emitToUser } = require("../../sockets/realtimeSocket");

const getParticipantIds = (req) => {
  const role = req.user?.role;
  const userId = req.user?._id;
  const customerId =
    role === "customer" ? userId : req.body.customerId || req.query.customerId;
  const shipperId =
    role === "shipper" ? userId : req.body.shipperId || req.query.shipperId;

  return { role, userId, customerId, shipperId };
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
    const { customerId, shipperId } = getParticipantIds(req);

    if (!customerId || !shipperId) {
      return res.status(400).json({
        success: false,
        message: "customerId and shipperId are required.",
      });
    }

    const room = await getOrCreateChatRoom({ customerId, shipperId });

    return res.status(200).json({
      success: true,
      room,
      roomId: room._id,
    });
  } catch (error) {
    console.error("getOrCreateRoom error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to open chat room.",
    });
  }
};

exports.getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await ensureRoomParticipant({
      roomId,
      userId: req.user._id,
      role: req.user.role,
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
    const messageText = (req.body.message || "").trim();
    const room = await ensureRoomParticipant({
      roomId,
      userId: req.user._id,
      role: req.user.role,
    });

    if (!room) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to send messages in this chat.",
      });
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
      senderRole: req.user.role,
      message: messageText,
      media: mediaItem ? [mediaItem] : [],
    });

    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: messageText || "Image",
      lastMessageAt: new Date(),
    });

    const io = req.app.get("io");
    if (io) {
      io.to(roomId).emit("receiveMessage", chatMessage);

      const receiver = room.participants.find(
        (participant) =>
          participant.userId.toString() !== req.user._id.toString() ||
          participant.role !== req.user.role
      );

      if (receiver) {
        emitToUser(io, {
          role: receiver.role,
          userId: receiver.userId,
          event: "horse_shipt:chat_message_created",
          payload: chatMessage,
          notification: {
            type: "chat_message",
            title: "New chat message",
            message:
              req.user.role === "customer"
                ? "A customer sent you a message"
                : "A shipper sent you a message",
          },
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: chatMessage,
    });
  } catch (error) {
    console.error("sendRoomMessage error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send message.",
    });
  }
};
