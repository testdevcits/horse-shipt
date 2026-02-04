module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    //  Room join
    socket.on("joinRoom", ({ roomId }) => {
      socket.join(roomId);
      console.log("Joined room:", roomId);
    });

    //  Message receive + broadcast
    socket.on("sendMessage", (data) => {
      console.log("Message received:", data);

      const { roomId } = data;

      // Room ke sab logon ko message bhejo
      io.to(roomId).emit("receiveMessage", data);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
