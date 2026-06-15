const QuoteNegotiation = require("../../models/shipper/QuoteNegotiation");

exports.getNegotiations = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const role = req.query.role;
    const search = (req.query.search || "").trim();

    const query = {};
    if (status && status !== "all") query.status = status;
    if (role && role !== "all") query.proposedByRole = role;

    const baseQuery = QuoteNegotiation.find(query)
      .populate({
        path: "quote",
        select:
          "totalPrice originalPrice negotiatedPrice negotiationStatus status paymentStatus currency createdAt",
      })
      .populate({
        path: "shipment",
        select: "shipmentCode pickupLocation deliveryLocation status customer",
      })
      .populate("customer", "name email phone mobile")
      .populate("shipper", "name email phone mobile companyName")
      .sort({ createdAt: -1 });

    const [rows, total, stats] = await Promise.all([
      baseQuery.clone().skip(skip).limit(limit).lean(),
      QuoteNegotiation.countDocuments(query),
      QuoteNegotiation.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const filteredRows = search
      ? rows.filter((item) => {
          const haystack = [
            item.shipment?.shipmentCode,
            item.customer?.name,
            item.customer?.email,
            item.shipper?.name,
            item.shipper?.companyName,
            item.shipper?.email,
            item.reason,
            item.responseReason,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(search.toLowerCase());
        })
      : rows;

    return res.json({
      success: true,
      data: filteredRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
      stats: stats.reduce(
        (acc, item) => ({
          ...acc,
          [item._id || "unknown"]: {
            count: item.count,
            amount: item.amount,
          },
        }),
        {}
      ),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quote negotiations",
      error: error.message,
    });
  }
};
