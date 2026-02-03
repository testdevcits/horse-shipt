const Shipper = require("../../models/shipper/shipperModel");

/**
 * Customer → Shipper list (for chat)
 */
exports.getShippersForChat = async (req, res) => {
  try {
    const shippers = await Shipper.find(
      { isActive: true },
      {
        name: 1,
        email: 1,
        profileImage: 1,
        isLogin: 1,
        currentLocation: 1,
      }
    ).sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: shippers,
    });
  } catch (error) {
    console.error("Get shippers for chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shippers for chat",
    });
  }
};
