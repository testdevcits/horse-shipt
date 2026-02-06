const Customer = require("../../models/customer/customerModel");
const formatChatUser = require("../../utils/formatChatUser");

/**
 * Fetch Customers → Shipper list (for chat)
 */
exports.getShippersForChat = async (req, res) => {
  try {
    const customers = await Customer.find(
      { isActive: true },
      {
        name: 1,
        email: 1,
        profileImage: 1,
        profilePicture: 1,
        isLogin: 1,
      }
    ).sort({ updatedAt: -1 });

    const formattedCustomers = customers.map((customer) =>
      formatChatUser(customer, "customer")
    );

    res.status(200).json({
      success: true,
      data: formattedCustomers,
    });
  } catch (error) {
    console.error("Get customers for chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customers for chat",
    });
  }
};
