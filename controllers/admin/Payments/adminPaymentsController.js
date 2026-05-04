const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../../models/admin/payment/platformSettings");
const { buildPagination, sendPaginated } = require("../../../utils/adminQuery");

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
    const { page, limit, skip } = buildPagination(req.query);
    const { status } = req.query;
    const filter = {
      paymentStatus: { $in: ["paid", "pending"] },
    };

    if (status) filter.paymentStatus = status;

    const [payments, total] = await Promise.all([
      ShipmentQuote.find(filter)
      .populate({
        path: "shipment",
        populate: {
          path: "customer",
          select: "name email",
        },
      })
      .populate("shipper", "name email companyName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ShipmentQuote.countDocuments(filter),
    ]);

    return sendPaginated(res, { data: payments, total, page, limit });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
};
