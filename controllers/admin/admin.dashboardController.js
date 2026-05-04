const Customer = require("../../models/customer/customerModel");
const CustomerPayment = require("../../models/customer/CustomerPaymentModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const Shipper = require("../../models/shipper/shipperModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");

const startOfMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const buildMonthBuckets = (months = 6) => {
  const buckets = [];
  const now = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    buckets.push({
      key: monthKey(date),
      label: date.toLocaleString("en-US", { month: "short", year: "numeric" }),
      payments: 0,
      shippers: 0,
      customers: 0,
      shipments: 0,
    });
  }

  return buckets;
};

const groupCountsByMonth = async (Model, dateField, fromDate, extraMatch = {}) =>
  Model.aggregate([
    { $match: { ...extraMatch, [dateField]: { $gte: fromDate } } },
    {
      $group: {
        _id: {
          year: { $year: `$${dateField}` },
          month: { $month: `$${dateField}` },
        },
        count: { $sum: 1 },
      },
    },
  ]);

exports.getDashboardOverview = async (req, res) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
    const buckets = buildMonthBuckets(months);
    const fromDate = startOfMonth(
      new Date(new Date().getFullYear(), new Date().getMonth() - months + 1, 1)
    );

    const [
      totalCustomers,
      totalShippers,
      totalShipments,
      activeShipments,
      pendingShipments,
      deliveredShipments,
      paidQuotes,
      pendingPayments,
      recentShipments,
      recentPayments,
      customerMonthly,
      shipperMonthly,
      shipmentMonthly,
      paymentMonthly,
    ] = await Promise.all([
      Customer.countDocuments(),
      Shipper.countDocuments(),
      CustomerShipment.countDocuments(),
      CustomerShipment.countDocuments({
        status: { $in: ["assigned", "picked", "in_transit"] },
      }),
      CustomerShipment.countDocuments({
        status: { $in: ["pending", "open_for_offers"] },
      }),
      CustomerShipment.countDocuments({ status: "delivered" }),
      ShipmentQuote.find({ paymentStatus: "paid" }).select(
        "totalPrice platformFee paidAt createdAt"
      ),
      ShipmentQuote.countDocuments({ paymentStatus: "pending" }),
      CustomerShipment.find()
        .populate("customer", "name email uniqueId")
        .populate("shipper", "name email uniqueId")
        .sort({ createdAt: -1 })
        .limit(6),
      ShipmentQuote.find({ paymentStatus: { $in: ["paid", "pending"] } })
        .populate({
          path: "shipment",
          select: "shipmentCode customer pickupLocation deliveryLocation",
          populate: { path: "customer", select: "name email uniqueId" },
        })
        .populate("shipper", "name email uniqueId companyName")
        .sort({ createdAt: -1 })
        .limit(6),
      groupCountsByMonth(Customer, "createdAt", fromDate),
      groupCountsByMonth(Shipper, "createdAt", fromDate),
      groupCountsByMonth(CustomerShipment, "createdAt", fromDate),
      ShipmentQuote.aggregate([
        {
          $match: {
            paymentStatus: "paid",
            $or: [{ paidAt: { $gte: fromDate } }, { createdAt: { $gte: fromDate } }],
          },
        },
        {
          $group: {
            _id: {
              year: { $year: { $ifNull: ["$paidAt", "$createdAt"] } },
              month: { $month: { $ifNull: ["$paidAt", "$createdAt"] } },
            },
            payments: { $sum: "$totalPrice" },
          },
        },
      ]),
    ]);

    const bucketMap = buckets.reduce((acc, bucket) => {
      acc[bucket.key] = bucket;
      return acc;
    }, {});

    const applyCounts = (rows, field) => {
      rows.forEach((row) => {
        const key = `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
        if (bucketMap[key]) bucketMap[key][field] = row.count;
      });
    };

    applyCounts(customerMonthly, "customers");
    applyCounts(shipperMonthly, "shippers");
    applyCounts(shipmentMonthly, "shipments");
    paymentMonthly.forEach((row) => {
      const key = `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
      if (bucketMap[key]) bucketMap[key].payments = row.payments || 0;
    });

    const totalPayments = paidQuotes.reduce(
      (sum, quote) => sum + (quote.totalPrice || 0),
      0
    );
    const platformEarnings = paidQuotes.reduce(
      (sum, quote) => sum + (quote.platformFee || 0),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        totals: {
          customers: totalCustomers,
          shippers: totalShippers,
          shipments: totalShipments,
          activeShipments,
          pendingShipments,
          deliveredShipments,
          paidTransactions: paidQuotes.length,
          pendingPayments,
          totalPayments,
          platformEarnings,
        },
        charts: {
          monthly: buckets,
          shipmentStatus: [
            { name: "Pending", value: pendingShipments },
            { name: "Active", value: activeShipments },
            { name: "Delivered", value: deliveredShipments },
            {
              name: "Other",
              value: Math.max(
                totalShipments -
                  pendingShipments -
                  activeShipments -
                  deliveredShipments,
                0
              ),
            },
          ],
        },
        recent: {
          shipments: recentShipments,
          payments: recentPayments,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
    });
  }
};

exports.getAdminApiCatalog = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: [
      "GET /api/admin/dashboard/overview",
      "GET /api/admin/dashboard/apis",
      "GET /api/admin/customers/all?page=&limit=&search=&status=",
      "GET /api/admin/customers/:id",
      "GET /api/admin/customers/:id/payments",
      "GET /api/admin/customers/:id/full-data",
      "GET /api/admin/shippers/all?page=&limit=&search=&status=",
      "GET /api/admin/shippers/:id",
      "GET /api/admin/shippers/:id/full-data",
      "GET /api/admin/shipments/all?page=&limit=&status=&shipper=&customer=&search=",
      "GET /api/admin/shipments/:id",
      "GET /api/admin/shipments/:id/tracking",
      "GET /api/admin/payments/summary",
      "GET /api/admin/payments/transactions?page=&limit=&status=&search=",
    ],
  });
};
