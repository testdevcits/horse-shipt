const Message = require("../models/chat/messageModel");
const ChatRoom = require("../models/chat/chatRoomModel");
const { getOrCreateChatRoom } = require("../controllers/chat/chatController");
const { emitToUser } = require("./realtimeSocket");

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("joinRoom", async ({ customerId, shipperId }) => {
      const room = await getOrCreateChatRoom({ customerId, shipperId });
      socket.join(room._id.toString());
      socket.emit("roomJoined", room._id);
    });

    socket.on("sendMessage", async (data) => {
      const { roomId, senderId, senderRole, message } = data;

      const msg = await Message.create({
        chatRoom: roomId,
        senderId,
        senderRole,
        message,
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
      }
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
