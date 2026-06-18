const { apiResponse } = require("../../responses/api.response");
const Customer = require("../../models/customer/customerModel");
const CustomerPayment = require("../../models/customer/CustomerPaymentModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const { buildPagination, sendPaginated } = require("../../utils/adminQuery");

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

    const customer = await Customer.findById(id).select("-password");

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.CUSTOMER_NOT_FOUND });
    }

    const [shipments, payments, quotes] = await Promise.all([
      CustomerShipment.find({ customer: id })
      .populate("shipper", "name email uniqueId phone")
        .sort({ createdAt: -1 }),
      CustomerPayment.find({ userId: id, softDeleted: { $ne: true } }).sort({
        createdAt: -1,
      }),
      ShipmentQuote.find()
        .populate({
          path: "shipment",
          match: { customer: id },
          select: "shipmentCode customer pickupLocation deliveryLocation status",
        })
        .populate("shipper", "name email uniqueId companyName")
        .sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        customer,
        shipments,
        payments: payments.map(redactPaymentSecret),
        quotes: quotes.filter((quote) => quote.shipment),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.getCustomerPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findById(id).select("_id name email uniqueId");

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.CUSTOMER_NOT_FOUND });
    }

    const [paymentSettings, transactions] = await Promise.all([
      CustomerPayment.find({ userId: id, softDeleted: { $ne: true } }).sort({
        createdAt: -1,
      }),
      ShipmentQuote.find({ paymentStatus: { $in: ["paid", "pending"] } })
        .populate({
          path: "shipment",
          match: { customer: id },
          select: "shipmentCode customer pickupLocation deliveryLocation status",
        })
        .populate("shipper", "name email uniqueId companyName")
        .sort({ createdAt: -1 }),
    ]);

    const customerTransactions = transactions.filter((quote) => quote.shipment);

    return res.status(200).json({
      success: true,
      data: {
        customer,
        paymentSettings: paymentSettings.map(redactPaymentSecret),
        transactions: customerTransactions,
        summary: {
          totalPaid: customerTransactions
            .filter((quote) => quote.paymentStatus === "paid")
            .reduce((sum, quote) => sum + (quote.totalPrice || 0), 0),
          paidTransactions: customerTransactions.filter(
            (quote) => quote.paymentStatus === "paid"
          ).length,
          pendingTransactions: customerTransactions.filter(
            (quote) => quote.paymentStatus === "pending"
          ).length,
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
