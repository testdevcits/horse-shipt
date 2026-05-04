const Message = require("../models/chat/messageModel");
const ChatRoom = require("../models/chat/chatRoomModel");
const { getOrCreateChatRoom } = require("../controllers/chat/chatController");
const { emitToUser } = require("./realtimeSocket");
const sharp = require("sharp");
const streamifier = require("streamifier");
const cloudinary = require("../utils/cloudinary");
const { notifyChatReceiver } = require("../utils/chatNotificationService");

const MAX_CHAT_IMAGE_SIZE = 10 * 1024 * 1024;

const parseDataUrl = (dataUrl = "") => {
  const match = dataUrl.match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/i);
  if (!match) return null;

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[3], "base64"),
  };
};

const uploadChatImage = async (attachment) => {
  if (!attachment?.dataUrl) return null;

  const parsed = parseDataUrl(attachment.dataUrl);
  if (!parsed) {
    throw new Error("Only PNG, JPG, JPEG, or WEBP images are supported.");
  }

  if (parsed.buffer.length > MAX_CHAT_IMAGE_SIZE) {
    throw new Error("Image must be 10MB or smaller.");
  }

  const compressedBuffer = await sharp(parsed.buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();

  const uploaded = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "chat_media",
        resource_type: "image",
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );

    streamifier.createReadStream(compressedBuffer).pipe(uploadStream);
  });

  return {
    type: "image",
    url: uploaded.secure_url,
    public_id: uploaded.public_id,
    mimeType: "image/jpeg",
    originalName: attachment.name || "",
    size: compressedBuffer.length,
  };
};

module.exports = (io) => {
  io.on("connection", (socket) => {

    socket.on("joinRoom", async ({ customerId, shipperId, shipmentId }, ack) => {
      try {
        if (!shipmentId) {
          const message = "shipmentId is required to join chat.";
          if (ack) ack({ success: false, message });
          socket.emit("chatError", { message });
          return;
        }

        const room = await getOrCreateChatRoom({
          customerId,
          shipperId,
          shipmentId,
        });
        socket.join(room._id.toString());
        socket.emit("roomJoined", room._id);
        if (ack) ack({ success: true, roomId: room._id });
      } catch (error) {
        const message = error.message || "Failed to join chat room.";
        if (ack) ack({ success: false, message });
        socket.emit("chatError", { message });
      }
    });

    socket.on("sendMessage", async (data, ack) => {
      try {
        const { roomId, senderId, senderRole, message, attachment } = data;

        const trimmedMessage = (message || "").trim();
        if (!trimmedMessage && !attachment?.dataUrl) {
          if (ack) ack({ success: false, message: "Message or image required." });
          return;
        }

        const mediaItem = attachment?.dataUrl
          ? await uploadChatImage(attachment)
          : null;

        const msg = await Message.create({
          chatRoom: roomId,
          senderId,
          senderRole,
          message: trimmedMessage,
          media: mediaItem ? [mediaItem] : [],
        });

        io.to(roomId).emit("receiveMessage", msg);

        const room = await ChatRoom.findById(roomId).lean();
        const receiver = room?.participants?.find(
          (participant) =>
            participant.userId.toString() !== senderId.toString() ||
            participant.role !== senderRole
        );

        if (receiver) {
          emitToUser(io, {
            role: receiver.role,
            userId: receiver.userId,
            event: "horse_shipt:chat_message_created",
            payload: msg,
            notification: {
              type: "chat_message",
              title: "New chat message",
              message:
                senderRole === "customer"
                  ? "A customer sent you a message"
                  : "A shipper sent you a message",
            },
          });

          notifyChatReceiver({
            receiverRole: receiver.role,
            receiverId: receiver.userId,
            senderRole,
            messageText: trimmedMessage || "Image",
            shipmentId: room?.shipment,
          });
        }

        if (ack) ack({ success: true, message: msg });
      } catch (error) {
        console.error("Socket sendMessage error:", error);
        if (ack) {
          ack({
            success: false,
            message: error.message || "Failed to send message.",
          });
        }
      }
    });

    socket.on("disconnect", () => {
    });
  });
};
