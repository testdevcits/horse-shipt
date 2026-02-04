const ChatRoom = require("../../models/chat/chatRoomModel");

exports.getOrCreateChatRoom = async ({ customerId, shipperId }) => {
  let room = await ChatRoom.findOne({
    participants: {
      $all: [
        { $elemMatch: { userId: customerId, role: "customer" } },
        { $elemMatch: { userId: shipperId, role: "shipper" } },
      ],
    },
  });

  if (!room) {
    room = await ChatRoom.create({
      participants: [
        { userId: customerId, role: "customer" },
        { userId: shipperId, role: "shipper" },
      ],
    });
  }

  return room;
};
