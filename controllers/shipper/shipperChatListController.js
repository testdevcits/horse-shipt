const Customer = require("../../models/customer/customerModel");

/**
 * Shipper → Customer list (for chat)
 */
exports.getCustomersForChat = async (req, res) => {
  try {
    const customers = await Customer.find(
      { isActive: true },
      {
        name: 1,
        email: 1,
        profilePicture: 1,
        isLogin: 1,
        currentLocation: 1,
      }
    ).sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: customers,
    });
  } catch (error) {
    console.error("Get customers for chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customers for chat",
    });
  }
};
