const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../../models/admin/payment/platformSettings");

exports.getPaymentSummary = async (req, res) => {
  try {
    const quotes = await ShipmentQuote.find({ paymentStatus: "paid" });

    let totalRevenue = 0;
    let platformFeeTotal = 0;
    let shipperTotal = 0;

    const settings = await PlatformSettings.findOne();

    for (const quote of quotes) {
      totalRevenue += quote.totalPrice;

      if (settings) {
        const percentFee =
          (quote.totalPrice * settings.platformFeePercent) / 100;

        const fee = percentFee + settings.platformFeeFlat;

        platformFeeTotal += fee;
        shipperTotal += quote.totalPrice - fee;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        totalPayments: totalRevenue,
        platformEarnings: platformFeeTotal,
        shipperReceives: shipperTotal,
        totalTransactions: quotes.length,
      },
    });
  } catch (error) {
    console.error("Payment summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment summary",
    });
  }
};

/* =====================================================
   ADMIN GET ALL PAYMENT TRANSACTIONS
===================================================== */
exports.getAllTransactions = async (req, res) => {
  try {
    const payments = await ShipmentQuote.find({
      paymentStatus: { $in: ["paid", "pending"] },
    })
      .populate({
        path: "shipment",
        populate: {
          path: "customer",
          select: "name email",
        },
      })
      .populate("shipper", "name email companyName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      total: payments.length,
      data: payments,
    });
  } catch (error) {
    console.error("Transaction list error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
};
