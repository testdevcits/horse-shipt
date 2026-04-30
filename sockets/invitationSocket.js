const getUserRoom = ({ role, userId }) => `horse_shipt:${role}:${userId}`;

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
  });
};

module.exports.getUserRoom = getUserRoom;
