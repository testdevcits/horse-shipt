// sockets/shipperSocket.js
// -----------------------------
// Shipper-specific Socket.IO events
// -----------------------------

module.exports = (socket, io) => {
  console.log("⚡ Shipper socket initialized:", socket.id);

  // -----------------------------
  // Join shipper private room
  // -----------------------------
  socket.on("join-shipper", (shipperId) => {
    socket.join(`shipper-${shipperId}`);
    console.log(`Shipper ${shipperId} joined room shipper-${shipperId}`);
  });

  // -----------------------------
  // Optional: receive live location from shipper client
  // -----------------------------
  socket.on("shipper:location", (data) => {
    const { shipperId, latitude, longitude } = data;

    // Emit location to all clients watching this shipper
    io.to(`shipper-${shipperId}`).emit("location:update", {
      shipperId,
      latitude,
      longitude,
      updatedAt: new Date(),
    });

    console.log(
      `Location update from shipper ${shipperId}:`,
      latitude,
      longitude
    );
  });
};
