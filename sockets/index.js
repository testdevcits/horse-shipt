// sockets/index.js
// -----------------------------
// Central Socket.IO manager
// -----------------------------

const shipperSocket = require("./shipperSocket");
// You can add other socket modules later
// const chatSocket = require("./chatSocket");

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    // -----------------------------
    // Shipper socket events
    // -----------------------------
    shipperSocket(socket, io);

    // -----------------------------
    // Other socket modules
    // -----------------------------
    // chatSocket(socket, io);

    // -----------------------------
    // Disconnect
    // -----------------------------
    socket.on("disconnect", () => {
      console.log("⚡ Client disconnected:", socket.id);
    });
  });
};
