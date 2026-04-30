const getUserRoom = ({ role, userId }) => `horse_shipt:${role}:${userId}`;
const getShipmentRoom = (shipmentId) => `horse_shipt:shipment:${shipmentId}`;

const emitToUser = (io, { role, userId, event, payload, notification }) => {
  if (!io || !role || !userId || !event) return;

  const room = getUserRoom({ role, userId });
  io.to(room).emit(event, payload);

  if (notification) {
    io.to(room).emit("horse_shipt:notification", {
      event,
      ...notification,
      data: payload,
      createdAt: new Date().toISOString(),
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
  });
};

module.exports.getUserRoom = getUserRoom;
module.exports.getShipmentRoom = getShipmentRoom;
module.exports.emitToUser = emitToUser;
module.exports.emitToShipment = emitToShipment;
