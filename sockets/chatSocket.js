module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    // Join chat room
    socket.on("joinRoom", ({ roomId }) => {
      socket.join(roomId);
      console.log("Joined room:", roomId);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
