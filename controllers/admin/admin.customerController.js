const { apiResponse } = require("../../responses/api.response");
const Customer = require("../../models/customer/customerModel");
const CustomerPayment = require("../../models/customer/CustomerPaymentModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const {
  buildNamedPagination,
  buildPagination,
  buildPaginationMeta,
  sendPaginated,
} = require("../../utils/adminQuery");

const redactPaymentSecret = (payment) => {
  const doc = payment.toObject ? payment.toObject() : payment;
  return {
    ...doc,
    pkLive: doc.pkLive ? `${doc.pkLive.slice(0, 8)}...` : null,
    skLive: doc.skLive ? "********" : null,
    otp: undefined,
  };
};

exports.getAllCustomers = async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const { search, status } = req.query;
    const filter = {};

    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { uniqueId: { $regex: search, $options: "i" } },
      ];
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter)
      .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Customer.countDocuments(filter),
    ]);

    return sendPaginated(res, { data: customers, total, page, limit });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const shipmentPaging = buildNamedPagination(req.query, "shipment", 5);
    const paymentPaging = buildNamedPagination(req.query, "payment", 5);
    const quotePaging = buildNamedPagination(req.query, "quote", 5);

    const customer = await Customer.findById(id).select("-password");

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.CUSTOMER_NOT_FOUND });
    }

    const customerShipmentIds = await CustomerShipment.distinct("_id", {
      customer: id,
    });
    const quoteFilter = {
      shipment: { $in: customerShipmentIds },
      paymentStatus: { $in: ["paid", "pending"] },
    };
    const [
      shipments,
      shipmentsTotal,
      payments,
      paymentsTotal,
      quotes,
      quotesTotal,
    ] = await Promise.all([
      CustomerShipment.find({ customer: id })
      .populate("shipper", "name email uniqueId phone")
        .sort({ createdAt: -1 })
        .skip(shipmentPaging.skip)
        .limit(shipmentPaging.limit),
      CustomerShipment.countDocuments({ customer: id }),
      CustomerPayment.find({ userId: id, softDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(paymentPaging.skip)
        .limit(paymentPaging.limit),
      CustomerPayment.countDocuments({ userId: id, softDeleted: { $ne: true } }),
      ShipmentQuote.find(quoteFilter)
        .populate({
          path: "shipment",
          select: "shipmentCode customer pickupLocation deliveryLocation status",
        })
        .populate("shipper", "name email uniqueId companyName")
        .sort({ createdAt: -1 })
        .skip(quotePaging.skip)
        .limit(quotePaging.limit),
      ShipmentQuote.countDocuments(quoteFilter),
    ]);

    res.status(200).json({
      success: true,
      data: {
        customer,
        shipments,
        payments: payments.map(redactPaymentSecret),
        quotes,
        pagination: {
          shipments: buildPaginationMeta({
            total: shipmentsTotal,
            page: shipmentPaging.page,
            limit: shipmentPaging.limit,
          }),
          payments: buildPaginationMeta({
            total: paymentsTotal,
            page: paymentPaging.page,
            limit: paymentPaging.limit,
          }),
          quotes: buildPaginationMeta({
            total: quotesTotal,
            page: quotePaging.page,
            limit: quotePaging.limit,
          }),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.getCustomerPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const paymentPaging = buildNamedPagination(req.query, "payment", 10);
    const transactionPaging = buildNamedPagination(req.query, "transaction", 10);
    const customer = await Customer.findById(id).select("_id name email uniqueId");

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.CUSTOMER_NOT_FOUND });
    }

    const customerShipmentIds = await CustomerShipment.distinct("_id", {
      customer: id,
    });
    const paymentFilter = { userId: id, softDeleted: { $ne: true } };
    const transactionFilter = {
      shipment: { $in: customerShipmentIds },
      paymentStatus: { $in: ["paid", "pending"] },
    };

    const [
      paymentSettings,
      paymentSettingsTotal,
      transactions,
      transactionsTotal,
      paidSummary,
      pendingTransactions,
    ] = await Promise.all([
      CustomerPayment.find(paymentFilter)
        .sort({ createdAt: -1 })
        .skip(paymentPaging.skip)
        .limit(paymentPaging.limit),
      CustomerPayment.countDocuments(paymentFilter),
      ShipmentQuote.find(transactionFilter)
        .populate({
          path: "shipment",
          select: "shipmentCode customer pickupLocation deliveryLocation status",
        })
        .populate("shipper", "name email uniqueId companyName")
        .sort({ createdAt: -1 })
        .skip(transactionPaging.skip)
        .limit(transactionPaging.limit),
      ShipmentQuote.countDocuments(transactionFilter),
      ShipmentQuote.aggregate([
        {
          $match: {
            shipment: { $in: customerShipmentIds },
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalPaid: { $sum: "$totalPrice" },
            paidTransactions: { $sum: 1 },
          },
        },
      ]),
      ShipmentQuote.countDocuments({
        shipment: { $in: customerShipmentIds },
        paymentStatus: "pending",
      }),
    ]);

    const paidTotals = paidSummary[0] || {
      totalPaid: 0,
      paidTransactions: 0,
    };

    return res.status(200).json({
      success: true,
      data: {
        customer,
        paymentSettings: paymentSettings.map(redactPaymentSecret),
        transactions,
        summary: {
          totalPaid: paidTotals.totalPaid || 0,
          paidTransactions: paidTotals.paidTransactions || 0,
          pendingTransactions,
        },
        pagination: {
          paymentSettings: buildPaginationMeta({
            total: paymentSettingsTotal,
            page: paymentPaging.page,
            limit: paymentPaging.limit,
          }),
          transactions: buildPaginationMeta({
            total: transactionsTotal,
            page: transactionPaging.page,
            limit: transactionPaging.limit,
          }),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.getCustomerFullData = exports.getCustomerById;

exports.updateCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const updateFields = { ...req.body };
    delete updateFields.password;

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      updateFields,
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedCustomer) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.CUSTOMER_NOT_FOUND });
    }

    res.status(200).json({
      success: true,
      message: apiResponse.CUSTOMER_UPDATED_SUCCESSFULLY,
      data: updatedCustomer,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.toggleCustomerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.CUSTOMER_NOT_FOUND });
    }

    customer.isActive = !customer.isActive;
    await customer.save();

    res.status(200).json({
      success: true,
      message: `Customer has been ${
        customer.isActive ? "activated" : "deactivated"
      }`,
      data: customer,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Customer.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.CUSTOMER_NOT_FOUND });
    }

    res.status(200).json({
      success: true,
      message: apiResponse.CUSTOMER_DELETED_SUCCESSFULLY,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};
