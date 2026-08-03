const { apiResponse } = require("../../responses/api.response");
const Stripe = require("stripe");
const Shipper = require("../../models/shipper/shipperModel");
const Driver = require("../../models/shipper/Driver");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const ShipperPreferredArea = require("../../models/shipper/shipperPreferredAreaModel");
const ShipperContract = require("../../models/shipper/shipperContractModel");
const Subscription = require("../../models/shipper/subscriptionModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const {
  buildNamedPagination,
  buildPagination,
  buildPaginationMeta,
  sendPaginated,
} = require("../../utils/adminQuery");

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const buildSubscriptionSnapshot = (subscription) => {
  if (!subscription) {
    return {
      hasSubscription: false,
      status: "none",
      planName: null,
      planType: null,
      amount: null,
      currency: null,
      interval: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      nextBillingDate: null,
      stripeSubscriptionId: null,
    };
  }

  return {
    hasSubscription: true,
    status: subscription.status || "unknown",
    planName: subscription.planName || "Subscription",
    planType: subscription.planType || null,
    amount: subscription.amount ?? null,
    currency: subscription.currency || null,
    interval: subscription.interval || null,
    currentPeriodStart: subscription.currentPeriodStart || null,
    currentPeriodEnd: subscription.currentPeriodEnd || null,
    trialStart: subscription.trialStart || null,
    trialEnd: subscription.trialEnd || null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
    canceledAt: subscription.canceledAt || null,
    nextBillingDate: subscription.nextBillingDate || null,
    stripeSubscriptionId: subscription.stripeSubscriptionId || null,
  };
};

const mapLatestSubscriptionsByShipper = async (shipperIds = []) => {
  if (!shipperIds.length) return new Map();

  const subscriptions = await Subscription.find({
    shipperId: { $in: shipperIds },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const latestByShipper = new Map();
  subscriptions.forEach((subscription) => {
    const shipperId = subscription.shipperId?.toString();
    if (shipperId && !latestByShipper.has(shipperId)) {
      latestByShipper.set(shipperId, buildSubscriptionSnapshot(subscription));
    }
  });

  return latestByShipper;
};

const getQuotePayoutAmount = (quote = {}) => {
  const storedPayout = Number(quote.shipperPayoutAmount || 0);
  if (storedPayout > 0) return storedPayout;

  return Math.max(
    Number(quote.totalPrice || 0) -
      Number(quote.stripeFee || 0) -
      Number(quote.platformFee || 0),
    0
  );
};

const enrichPayoutHistory = async (quotes = []) =>
  Promise.all(
    quotes.map(async (quote) => {
      const payout = getQuotePayoutAmount(quote);
      const hasStoredStripeFee = Number(quote.stripeFee || 0) > 0;

      if (!stripe || hasStoredStripeFee || !quote.stripeTransferId) {
        return { ...quote, shipperPayoutAmount: payout };
      }

      try {
        const transfer = await stripe.transfers.retrieve(quote.stripeTransferId);
        const transferAmount = Number(transfer.amount || 0) / 100;
        const stripeFee = Math.max(
          Number(quote.totalPrice || 0) -
            Number(quote.platformFee || 0) -
            transferAmount,
          0
        );

        return {
          ...quote,
          stripeFee,
          shipperPayoutAmount: transferAmount,
          payoutCurrency: transfer.currency?.toUpperCase?.() || quote.currency,
        };
      } catch (error) {
        return { ...quote, shipperPayoutAmount: payout };
      }
    })
  );

// ================================
//  GET ALL SHIPPERS
// ================================
exports.getAllShippers = async (req, res) => {
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
        { mobile: { $regex: search, $options: "i" } },
        { uniqueId: { $regex: search, $options: "i" } },
      ];
    }

    const [shippers, total] = await Promise.all([
      Shipper.find(filter)
      .select("-password") // hide password
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Shipper.countDocuments(filter),
    ]);

    const subscriptionsByShipper = await mapLatestSubscriptionsByShipper(
      shippers.map((shipper) => shipper._id)
    );

    const shippersWithSubscriptions = shippers.map((shipper) => ({
      ...shipper,
      subscription: subscriptionsByShipper.get(shipper._id.toString()) ||
        buildSubscriptionSnapshot(null),
    }));

    return sendPaginated(res, { data: shippersWithSubscriptions, total, page, limit });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ================================
//  GET SHIPPER BY ID
// ================================
exports.getShipperById = async (req, res) => {
  try {
    const { id } = req.params;
    const shipmentPaging = buildNamedPagination(req.query, "shipment", 5);
    const quotePaging = buildNamedPagination(req.query, "quote", 5);
    const vehiclePaging = buildNamedPagination(req.query, "vehicle", 5);
    const driverPaging = buildNamedPagination(req.query, "driver", 5);
    const areaPaging = buildNamedPagination(req.query, "area", 5);
    const contractPaging = buildNamedPagination(req.query, "contract", 5);
    const payoutPaging = buildNamedPagination(req.query, "payout", 5);

    const shipper = await Shipper.findById(id).select("-password").lean();

    if (!shipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    const [
      shipments,
      shipmentsTotal,
      quotes,
      quotesTotal,
      vehicles,
      vehiclesTotal,
      drivers,
      driversTotal,
      preferredAreas,
      preferredAreasTotal,
      contracts,
      contractsTotal,
      payoutHistory,
      payoutHistoryTotal,
      payoutSummary,
      latestSubscription,
    ] =
      await Promise.all([
        CustomerShipment.find({ shipper: id })
          .populate("customer", "name email uniqueId phone")
          .sort({ createdAt: -1 })
          .skip(shipmentPaging.skip)
          .limit(shipmentPaging.limit),
        CustomerShipment.countDocuments({ shipper: id }),
        ShipmentQuote.find({ shipper: id })
          .populate("shipment", "shipmentCode pickupLocation deliveryLocation status")
          .populate("assignedDriver", "name email phone")
          .populate("vehicle", "name make model licensePlate")
          .sort({ createdAt: -1 })
          .skip(quotePaging.skip)
          .limit(quotePaging.limit),
        ShipmentQuote.countDocuments({ shipper: id }),
        ShipperVehicle.find({ shipper: id })
          .sort({ createdAt: -1 })
          .skip(vehiclePaging.skip)
          .limit(vehiclePaging.limit),
        ShipperVehicle.countDocuments({ shipper: id }),
        Driver.find({ shipper: id })
          .select("-password")
          .sort({ createdAt: -1 })
          .skip(driverPaging.skip)
          .limit(driverPaging.limit),
        Driver.countDocuments({ shipper: id }),
        ShipperPreferredArea.find({ shipper: id })
          .sort({ createdAt: -1 })
          .skip(areaPaging.skip)
          .limit(areaPaging.limit),
        ShipperPreferredArea.countDocuments({ shipper: id }),
        ShipperContract.find({ shipper: id })
          .populate("customer", "name email uniqueId")
          .populate("shipment", "shipmentCode status")
          .sort({ createdAt: -1 })
          .skip(contractPaging.skip)
          .limit(contractPaging.limit),
        ShipperContract.countDocuments({ shipper: id }),
        ShipmentQuote.find({
          shipper: id,
          paymentStatus: "paid",
          tripStatus: "completed",
        })
          .populate({
            path: "shipment",
            select: "shipmentCode pickupLocation deliveryLocation status deliveredAt customer",
            populate: { path: "customer", select: "name email uniqueId" },
          })
          .sort({ paymentReleasedAt: -1, updatedAt: -1 })
          .skip(payoutPaging.skip)
          .limit(payoutPaging.limit)
          .lean(),
        ShipmentQuote.countDocuments({
          shipper: id,
          paymentStatus: "paid",
          tripStatus: "completed",
        }),
        ShipmentQuote.aggregate([
          {
            $match: {
              shipper: shipper._id,
              paymentStatus: "paid",
              tripStatus: "completed",
            },
          },
          {
            $group: {
              _id: null,
              totalShipments: { $sum: 1 },
              transferredShipments: {
                $sum: {
                  $cond: [{ $eq: ["$payoutStatus", "transferred"] }, 1, 0],
                },
              },
              pendingShipments: {
                $sum: {
                  $cond: [{ $ne: ["$payoutStatus", "transferred"] }, 1, 0],
                },
              },
              grossPaid: { $sum: { $ifNull: ["$totalPrice", 0] } },
              stripeFees: { $sum: { $ifNull: ["$stripeFee", 0] } },
              platformFees: { $sum: { $ifNull: ["$platformFee", 0] } },
              shipperPayouts: {
                $sum: {
                  $cond: [
                    { $gt: [{ $ifNull: ["$shipperPayoutAmount", 0] }, 0] },
                    "$shipperPayoutAmount",
                    {
                      $cond: [
                        {
                          $gt: [
                            {
                              $subtract: [
                                {
                                  $subtract: [
                                    { $ifNull: ["$totalPrice", 0] },
                                    { $ifNull: ["$stripeFee", 0] },
                                  ],
                                },
                                { $ifNull: ["$platformFee", 0] },
                              ],
                            },
                            0,
                          ],
                        },
                        {
                          $subtract: [
                            {
                              $subtract: [
                                { $ifNull: ["$totalPrice", 0] },
                                { $ifNull: ["$stripeFee", 0] },
                              ],
                            },
                            { $ifNull: ["$platformFee", 0] },
                          ],
                        },
                        0,
                      ],
                    },
                  ],
                },
              },
            },
          },
        ]),
        Subscription.findOne({ shipperId: id })
          .sort({ updatedAt: -1, createdAt: -1 })
          .lean(),
      ]);
    const enrichedPayoutHistory = await enrichPayoutHistory(payoutHistory);
    const subscription = buildSubscriptionSnapshot(latestSubscription);

    res.status(200).json({
      success: true,
      data: {
        shipper: {
          ...shipper,
          subscription,
        },
        subscription,
        shipments,
        quotes,
        vehicles,
        drivers,
        preferredAreas,
        contracts,
        payoutHistory: enrichedPayoutHistory,
        payoutSummary: payoutSummary[0] || {
          totalShipments: 0,
          transferredShipments: 0,
          pendingShipments: 0,
          grossPaid: 0,
          stripeFees: 0,
          platformFees: 0,
          shipperPayouts: 0,
        },
        pagination: {
          shipments: buildPaginationMeta({
            total: shipmentsTotal,
            page: shipmentPaging.page,
            limit: shipmentPaging.limit,
          }),
          quotes: buildPaginationMeta({
            total: quotesTotal,
            page: quotePaging.page,
            limit: quotePaging.limit,
          }),
          vehicles: buildPaginationMeta({
            total: vehiclesTotal,
            page: vehiclePaging.page,
            limit: vehiclePaging.limit,
          }),
          drivers: buildPaginationMeta({
            total: driversTotal,
            page: driverPaging.page,
            limit: driverPaging.limit,
          }),
          preferredAreas: buildPaginationMeta({
            total: preferredAreasTotal,
            page: areaPaging.page,
            limit: areaPaging.limit,
          }),
          contracts: buildPaginationMeta({
            total: contractsTotal,
            page: contractPaging.page,
            limit: contractPaging.limit,
          }),
          payoutHistory: buildPaginationMeta({
            total: payoutHistoryTotal,
            page: payoutPaging.page,
            limit: payoutPaging.limit,
          }),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.getShipperFullData = exports.getShipperById;

// ================================
//  UPDATE SHIPPER BY ID
// ================================
exports.updateShipperById = async (req, res) => {
  try {
    const { id } = req.params;

    const updateFields = { ...req.body };
    delete updateFields.password; // avoid updating password here

    const updatedShipper = await Shipper.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedShipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_UPDATED_SUCCESSFULLY,
      data: updatedShipper,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ================================
//  TOGGLE SHIPPER STATUS (Activate/Deactivate)
// ================================
exports.toggleShipperStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const shipper = await Shipper.findById(id);

    if (!shipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    shipper.isActive = !shipper.isActive;
    await shipper.save();

    res.status(200).json({
      success: true,
      message: `Shipper has been ${
        shipper.isActive ? "activated" : "deactivated"
      }`,
      data: shipper,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ================================
//  DELETE SHIPPER BY ID
// ================================
exports.deleteShipper = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Shipper.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_DELETED_SUCCESSFULLY,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};
