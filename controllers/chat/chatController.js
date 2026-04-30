const ChatRoom = require("../../models/chat/chatRoomModel");

exports.getOrCreateChatRoom = async ({ customerId, shipperId, shipmentId }) => {
  const participantQuery = {
    participants: {
      $all: [
        { $elemMatch: { userId: customerId, role: "customer" } },
        { $elemMatch: { userId: shipperId, role: "shipper" } },
      ],
    },
  };

  let room = await ChatRoom.findOne(
    shipmentId
      ? { shipment: shipmentId, ...participantQuery }
      : participantQuery
  );

  if (!room) {
    room = await ChatRoom.create({
      shipment: shipmentId || null,
      participants: [
        { userId: customerId, role: "customer" },
        { userId: shipperId, role: "shipper" },
      ],
    });
  }

  return room;
};
