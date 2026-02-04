const Message = require("../models/chat/messageModel");
const { getOrCreateChatRoom } = require("../controllers/chat/chatController");

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
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
