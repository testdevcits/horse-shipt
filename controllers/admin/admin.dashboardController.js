const { apiResponse } = require("../../responses/api.response");
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

const parseDateBoundary = (value, boundary = "start") => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (boundary === "end") date.setUTCHours(23, 59, 59, 999);
  return date;
};

const daysBetween = (startDate, endDate) =>
  Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  );

const buildCustomChartBuckets = (startDate, endDate) => {
  const totalDays = daysBetween(startDate, endDate);

  if (totalDays > 92) {
    const buckets = [];
    const cursor = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)
    );
    const lastMonth = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1)
    );

    while (cursor <= lastMonth) {
      buckets.push({
        key: monthKey(cursor),
        label: cursor.toLocaleString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
        payments: 0,
        shippers: 0,
        customers: 0,
        shipments: 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return { buckets, fromDate: startDate, toDate: endDate, groupFormat: "%Y-%m" };
  }

  const buckets = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= endDate) {
    buckets.push({
      key: utcDateKey(cursor),
      label: cursor.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      payments: 0,
      shippers: 0,
      customers: 0,
      shipments: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { buckets, fromDate: startDate, toDate: endDate, groupFormat: "%Y-%m-%d" };
};

const buildDateWindow = (fromDate, toDate) => {
  const window = {};
  if (fromDate) window.$gte = fromDate;
  if (toDate) window.$lte = toDate;
  return window;
};

const withDateWindow = (field, fromDate, toDate) => ({
  [field]: buildDateWindow(fromDate, toDate),
});

const groupCountsByPeriod = async (
  Model,
  dateField,
  fromDate,
  toDate,
  groupFormat,
  extraMatch = {}
) =>
  Model.aggregate([
    { $match: { ...extraMatch, [dateField]: buildDateWindow(fromDate, toDate) } },
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
    const requestedStartDate = parseDateBoundary(req.query.startDate, "start");
    const requestedEndDate = parseDateBoundary(req.query.endDate, "end");
    const hasCustomRange =
      requestedStartDate && requestedEndDate && requestedStartDate <= requestedEndDate;
    const chartWindow = hasCustomRange
      ? buildCustomChartBuckets(requestedStartDate, requestedEndDate)
      : buildChartBuckets(range, months);
    const { buckets, fromDate, groupFormat } = chartWindow;
    const toDate = chartWindow.toDate || new Date();
    const createdDateMatch = withDateWindow("createdAt", fromDate, toDate);
    const paidQuoteDateMatch = {
      $or: [
        { paidAt: buildDateWindow(fromDate, toDate) },
        { createdAt: buildDateWindow(fromDate, toDate) },
      ],
    };

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
      Customer.countDocuments(createdDateMatch),
      Shipper.countDocuments(createdDateMatch),
      CustomerShipment.countDocuments(createdDateMatch),
      CustomerShipment.countDocuments({
        ...createdDateMatch,
        status: { $in: ["assigned", "picked", "in_transit"] },
      }),
      CustomerShipment.countDocuments({
        ...createdDateMatch,
        status: { $in: ["pending", "open_for_offers"] },
      }),
      CustomerShipment.countDocuments({ ...createdDateMatch, status: "delivered" }),
      ShipmentQuote.find({ paymentStatus: "paid", ...paidQuoteDateMatch }).select(
        "totalPrice platformFee paidAt createdAt"
      ),
      ShipmentQuote.countDocuments({
        paymentStatus: "pending",
        ...createdDateMatch,
      }),
      CustomerShipment.find(createdDateMatch)
        .populate("customer", "name email uniqueId")
        .populate("shipper", "name email uniqueId")
        .sort({ createdAt: -1 })
        .limit(6),
      ShipmentQuote.find({
        paymentStatus: { $in: ["paid", "pending"] },
        ...paidQuoteDateMatch,
      })
        .populate({
          path: "shipment",
          select: "shipmentCode customer pickupLocation deliveryLocation",
          populate: { path: "customer", select: "name email uniqueId" },
        })
        .populate("shipper", "name email uniqueId companyName")
        .sort({ createdAt: -1 })
        .limit(6),
      groupCountsByPeriod(Customer, "createdAt", fromDate, toDate, groupFormat),
      groupCountsByPeriod(Shipper, "createdAt", fromDate, toDate, groupFormat),
      groupCountsByPeriod(
        CustomerShipment,
        "createdAt",
        fromDate,
        toDate,
        groupFormat
      ),
      ShipmentQuote.aggregate([
        {
          $match: {
            paymentStatus: "paid",
            ...paidQuoteDateMatch,
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
      PendingSignup.countDocuments(createdDateMatch),
      PendingSignup.find(createdDateMatch)
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
          range: hasCustomRange ? "custom" : range,
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
      message: apiResponse.FAILED_TO_FETCH_DASHBOARD_DATA,
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
