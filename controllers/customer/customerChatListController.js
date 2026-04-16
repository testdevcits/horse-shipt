exports.getShippersForChat = async (req, res) => {
  try {
    const shippers = await Shipper.find(
      { isActive: true },
      {
        name: 1,
        email: 1,
        profileImage: 1,
        profilePicture: 1,
        isLogin: 1,
      }
    ).sort({ updatedAt: -1 });

    const formattedShippers = shippers.map((shipper) => {
      const formatted = formatChatUser(shipper, "shipper");

      return {
        ...formatted,
        isOnline: Boolean(shipper.isLogin),
      };
    });

    res.status(200).json({
      success: true,
      data: formattedShippers,
    });
  } catch (error) {
    console.error("Get shippers for chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shippers for chat",
    });
  }
};
