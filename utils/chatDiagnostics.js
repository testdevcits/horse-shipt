const { randomUUID } = require("crypto");

// Enable temporarily with CHAT_DEBUG=true. Never pass message bodies or credentials.
const chatLog = (event, details = {}) => {
  if (process.env.CHAT_DEBUG !== "true") return;
  console.info("[CHAT]", JSON.stringify({ time: new Date().toISOString(), event, ...details }));
};

const traceChatRequest = (req, res, operation) => {
  const traceId = randomUUID();
  const started = Date.now();
  const details = { traceId, operation, userId: req.user?._id,
    roomId: req.params?.roomId, messageId: req.params?.messageId };
  chatLog("api.start", details);
  res.once("finish", () => chatLog("api.finish", {
    ...details, status: res.statusCode, elapsedMs: Date.now() - started,
  }));
  return (event, extra = {}) => chatLog(event, { ...details, ...extra });
};

const traceChatSocket = (socket) => {
  const details = { socketId: socket.id, userId: socket.handshake.auth?.userId,
    role: socket.handshake.auth?.role };
  chatLog("socket.connected", { ...details, transport: socket.conn.transport.name });
  socket.conn.on("upgrade", (transport) => chatLog("socket.upgraded", { ...details, transport: transport.name }));
  socket.on("disconnect", (reason) => chatLog("socket.disconnected", { ...details, reason }));
  socket.use((packet, next) => {
    const [event, data] = packet;
    if (["joinRoom", "sendMessage", "horse_shipt:join_chat_room", "horse_shipt:join_user_room"].includes(event)) {
      const traceId = randomUUID();
      const meta = { ...details, traceId, socketEvent: event, roomId: data?.roomId, shipmentId: data?.shipmentId };
      chatLog("socket.request", meta);
      const last = packet.length - 1;
      if (typeof packet[last] === "function") {
        const ack = packet[last];
        packet[last] = (...args) => {
          chatLog("socket.ack", { ...meta, success: args[0]?.success, roomId: args[0]?.roomId || data?.roomId });
          ack(...args);
        };
      }
    }
    next();
  });
  socket.onAnyOutgoing((event, data) => {
    if (["receiveMessage", "messageEdited", "messageDeleted", "roomJoined", "chatError", "horse_shipt:chat_message_created"].includes(event)) {
      chatLog("socket.outgoing", { ...details, socketEvent: event,
        roomId: data?.chatRoom, messageId: data?._id || data?.message?._id });
    }
  });
};

module.exports = { chatLog, traceChatRequest, traceChatSocket };
