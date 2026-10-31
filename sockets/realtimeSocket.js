const getUserRoom = ({ role, userId }) => `horse_shipt:${role}:${userId}`;
const getShipmentRoom = (shipmentId) => `horse_shipt:shipment:${shipmentId}`;
const ADMIN_ROOM = "horse_shipt:admin";
const UserNotification = require("../models/common/UserNotification");
const ChatRoom = require("../models/chat/chatRoomModel");
const ShipmentQuote = require("../models/shipper/ShipmentQuote");
const {
  isInAppNotificationEnabled,
} = require("../utils/notificationPreferences");

const toPlainPayload = (payload) => {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return null;
  }
};

const emitToUser = (io, { role, userId, event, payload, notification }) => {
  if (!io || !role || !userId || !event) return;

  const room = getUserRoom({ role, userId });
  io.to(room).emit(event, payload);

  if (notification) {
    const data = toPlainPayload(payload);
    const notificationPayload = {
      event,
      ...notification,
      data,
      createdAt: new Date().toISOString(),
    };

    isInAppNotificationEnabled({
      role,
      userId,
      type: notification.type || event,
    })
      .then((enabled) => {
        if (!enabled) return;

        UserNotification.create({
          role,
          user: userId,
          event,
          type: notification.type || "notification",
          title: notification.title || "Notification",
          message: notification.message,
          data,
        }).catch((error) => {
          console.error("Persist notification error:", error.message);
        });

        io.to(room).emit("horse_shipt:notification", notificationPayload);
      })
      .catch((error) => {
        console.error("Notification preference error:", error.message);
      });
  }
};

const emitToShipment = (io, { shipmentId, event, payload }) => {
  if (!io || !shipmentId || !event) return;
  io.to(getShipmentRoom(shipmentId)).emit(event, payload);
};

module.exports = (io) => {
  io.on("connection", (socket) => {
    const { userId, role } = socket.handshake.auth || {};

    if (userId && role) {
      socket.join(getUserRoom({ role, userId }));
    }

    socket.on("horse_shipt:join_user_room", ({ userId, role }) => {
      if (!userId || !role) return;
      socket.join(getUserRoom({ role, userId }));
    });

    socket.on("horse_shipt:join_shipment_room", ({ shipmentId }) => {
      if (!shipmentId) return;
      socket.join(getShipmentRoom(shipmentId));
    });

    socket.on("horse_shipt:join_chat_room", async ({ roomId } = {}, ack) => {
      if (!roomId || !userId || !role) {
        ack?.({ success: false, message: "Room and authenticated user are required." });
        return;
      }

      try {
        const room = await ChatRoom.findById(roomId).lean();
        const isParticipant = room?.participants?.some(
          (participant) =>
            participant.userId.toString() === userId.toString() &&
            participant.role === role
        );
        if (!isParticipant) {
          ack?.({ success: false, message: "Not authorized to join this chat." });
          return;
        }

        if (room.shipment) {
          const shipper = room.participants.find(
            (participant) => participant.role === "shipper"
          );
          const acceptedQuote = shipper
            ? await ShipmentQuote.exists({
                shipment: room.shipment,
                shipper: shipper.userId,
                status: "accepted",
                isCancelled: { $ne: true },
              })
            : null;
          if (!acceptedQuote) {
            ack?.({ success: false, message: "Chat is unavailable for this shipment." });
            return;
          }
        }

        socket.join(roomId.toString());
        ack?.({ success: true, roomId: roomId.toString() });
      } catch (error) {
        console.error("Socket chat room join error:", error.message);
        ack?.({ success: false, message: "Failed to join chat room." });
      }
    });

    // Only relay typing for a room this socket has already been allowed to join.
    const typingRooms = new Set();
    socket.on("horse_shipt:typing", ({ roomId, isTyping } = {}) => {
      if (typeof roomId !== "string" || typeof isTyping !== "boolean" ||
          !userId || !role || !socket.rooms.has(roomId)) return;
      if (isTyping) typingRooms.add(roomId);
      else typingRooms.delete(roomId);
      socket.to(roomId).emit("horse_shipt:typing", { roomId, userId, role, isTyping });
    });
    socket.on("disconnecting", () => {
      typingRooms.forEach((roomId) => socket.to(roomId).emit("horse_shipt:typing", {
        roomId, userId, role, isTyping: false,
      }));
    });

    socket.on("horse_shipt:join_admin_room", () => {
      socket.join(ADMIN_ROOM);
    });
  });
};

module.exports.getUserRoom = getUserRoom;
module.exports.getShipmentRoom = getShipmentRoom;
module.exports.ADMIN_ROOM = ADMIN_ROOM;
module.exports.emitToUser = emitToUser;
module.exports.emitToShipment = emitToShipment;
