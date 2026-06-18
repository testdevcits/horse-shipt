const Customer = require("../../models/customer/customerModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const Shipper = require("../../models/shipper/shipperModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const PendingSignup = require("../../models/PendingSignup");

const monthKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;

const utcDateKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;

const utcHourKey = (date) =>
  `${utcDateKey(date)}-${String(date.getUTCHours()).padStart(2, "0")}`;

const buildMonthBuckets = (months = 6) => {
  const buckets = [];
  const now = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1)
    );
    buckets.push({
      key: monthKey(date),
      label: date.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      payments: 0,
      shippers: 0,
      customers: 0,
      shipments: 0,
    });
  }

  return buckets;
};

const buildChartBuckets = (range = "month", months = 6) => {
  const normalizedRange = ["day", "week", "month"].includes(range)
    ? range
    : "month";
  const now = new Date();

  if (normalizedRange === "day") {
    const currentHour = new Date(now);
    currentHour.setUTCMinutes(0, 0, 0);

    const buckets = [];
    let fromDate = new Date(currentHour);
    for (let index = 23; index >= 0; index -= 1) {
      const date = new Date(currentHour);
      date.setUTCHours(currentHour.getUTCHours() - index);
      if (index === 23) fromDate = new Date(date);
      buckets.push({
        key: utcHourKey(date),
        label: date.toLocaleString("en-US", {
          hour: "numeric",
          hour12: true,
          timeZone: "UTC",
        }),
        payments: 0,
        shippers: 0,
        customers: 0,
        shipments: 0,
      });
    }

    return {
      buckets,
      fromDate,
      groupFormat: "%Y-%m-%d-%H",
    };
  }

  if (normalizedRange === "week") {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    const buckets = [];
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - index);
      buckets.push({
        key: utcDateKey(date),
        label: date.toLocaleString("en-US", {
          weekday: "short",
          timeZone: "UTC",
        }),
        payments: 0,
        shippers: 0,
        customers: 0,
        shipments: 0,
      });
    }

    return {
      buckets,
      fromDate: buckets[0] ? new Date(`${buckets[0].key}T00:00:00Z`) : today,
      groupFormat: "%Y-%m-%d",
    };
  }

  const buckets = buildMonthBuckets(months);
  return {
    buckets,
    fromDate: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1)
    ),
    groupFormat: "%Y-%m",
  };
};

const groupCountsByPeriod = async (
  Model,
  dateField,
  fromDate,
  groupFormat,
  extraMatch = {}
) =>
  Model.aggregate([
    { $match: { ...extraMatch, [dateField]: { $gte: fromDate } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: groupFormat,
            date: `$${dateField}`,
            timezone: "UTC",
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

exports.getDashboardOverview = async (req, res) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
    const range = String(req.query.range || "month").toLowerCase();
    const { buckets, fromDate, groupFormat } = buildChartBuckets(range, months);

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
      pendingSignupCount,
      pendingSignups,
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
      groupCountsByPeriod(Customer, "createdAt", fromDate, groupFormat),
      groupCountsByPeriod(Shipper, "createdAt", fromDate, groupFormat),
      groupCountsByPeriod(CustomerShipment, "createdAt", fromDate, groupFormat),
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
              $dateToString: {
                format: groupFormat,
                date: { $ifNull: ["$paidAt", "$createdAt"] },
                timezone: "UTC",
              },
            },
            payments: { $sum: "$totalPrice" },
          },
        },
      ]),
      PendingSignup.countDocuments(),
      PendingSignup.find()
        .select("name email role createdAt lastSentAt otpExpiresAt attempts")
        .sort({ createdAt: -1 })
        .limit(6),
    ]);

    const bucketMap = buckets.reduce((acc, bucket) => {
      acc[bucket.key] = bucket;
      return acc;
    }, {});

    const applyCounts = (rows, field) => {
      rows.forEach((row) => {
        const key =
          typeof row._id === "string"
            ? row._id
            : `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
        if (bucketMap[key]) bucketMap[key][field] = row.count;
      });
    };

    applyCounts(customerMonthly, "customers");
    applyCounts(shipperMonthly, "shippers");
    applyCounts(shipmentMonthly, "shipments");
    paymentMonthly.forEach((row) => {
      const key =
        typeof row._id === "string"
          ? row._id
          : `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
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
          pendingSignups: pendingSignupCount,
          totalPayments,
          platformEarnings,
        },
        charts: {
          range,
          trend: buckets,
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
          pendingSignups,
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
