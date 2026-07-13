const { apiResponse } = require("../../../responses/api.response");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../../models/admin/payment/platformSettings");
const Subscription = require("../../../models/shipper/subscriptionModel");
const { buildPaginationMeta } = require("../../../utils/adminQuery");

const centsToMoney = (amount = 0) => Math.round(amount) / 100;

const sumStripeBalance = (items = []) =>
  items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

const parseDateBoundary = (value, boundary = "start") => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (boundary === "end") date.setUTCHours(23, 59, 59, 999);
  return date;
};

const getDateBounds = (query = {}) => {
  const startDate = parseDateBoundary(query.startDate, "start");
  const endDate = parseDateBoundary(query.endDate, "end");

  if (startDate && endDate && startDate <= endDate) {
    return { startDate, endDate, hasCustomRange: true };
  }

  return { startDate: null, endDate: null, hasCustomRange: false };
};

const buildMongoDateWindow = (startDate, endDate) => {
  const window = {};
  if (startDate) window.$gte = startDate;
  if (endDate) window.$lte = endDate;
  return window;
};

const getPlatformFeeForQuote = (quote, settings) => {
  if (Number(quote.platformFee) > 0) return Number(quote.platformFee);

  const platformPercent = Number(settings?.platformFeePercent || 0);
  const platformFlat = Number(settings?.platformFeeFlat || 0);
  const totalPrice = Number(quote.totalPrice || 0);

  return totalPrice * (platformPercent / 100) + platformFlat;
};

/* =====================================================
   GET STRIPE BALANCE
   - Show total pending & available
   - Gross / net after Stripe
   - Platform fee is NOT deducted yet (only for payout)
===================================================== */
exports.getStripeBalance = async (req, res) => {
  try {
    const balance = await stripe.balance.retrieve();

    const pending = balance.pending.reduce((sum, item) => sum + item.amount, 0);
    const available = balance.available.reduce(
      (sum, item) => sum + item.amount,
      0
    );

    res.status(200).json({
      success: true,
      data: {
        pending: pending / 100,
        available: available / 100,
        currency: balance.available[0]?.currency || "usd",
      },
    });
  } catch (error) {
    console.error("Stripe balance error:", error);

    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_STRIPE_BALANCE,
    });
  }
};

/* =====================================================
   GET STRIPE TRANSACTIONS WITH FILTER (today/week/month)
   - Show platform fee & net shipper receives
===================================================== */
exports.getStripeTransactions = async (req, res) => {
  try {
    const { range } = req.query; // today | week | month
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const { startDate: customStartDate, endDate, hasCustomRange } =
      getDateBounds(req.query);

    const now = new Date();
    let startDate = customStartDate;

    if (!hasCustomRange && range === "today") {
      startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (!hasCustomRange && range === "week") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 7);
    } else if (!hasCustomRange && range === "month") {
      startDate = new Date();
      startDate.setMonth(now.getMonth() - 1);
    }

    const stripeCreatedFilter = {};
    if (startDate) stripeCreatedFilter.gte = Math.floor(startDate.getTime() / 1000);
    if (hasCustomRange && endDate) {
      stripeCreatedFilter.lte = Math.floor(endDate.getTime() / 1000);
    }

    // Fetch raw Stripe transactions
    const transactions = await stripe.balanceTransactions.list({
      limit: 100,
      created: Object.keys(stripeCreatedFilter).length
        ? stripeCreatedFilter
        : undefined,
    });

    // Get platform settings
    const settings = await PlatformSettings.findOne();
    const platformPercent = settings?.platformFeePercent || 0;
    const platformFlat = settings?.platformFeeFlat || 0;

    // Map transactions with platform fee & net for shipper
    const formatted = await Promise.all(
      transactions.data.map(async (txn) => {
        let platformFee = 0;

        // Try to match txn with our ShipmentQuote if metadata exists
        if (txn.metadata?.quoteId) {
          const quote = await ShipmentQuote.findById(txn.metadata.quoteId);
          if (quote && quote.paymentStatus === "paid") {
            const netAfterStripe = txn.net; // in cents
            const platformFeePercentCents = Math.round(
              netAfterStripe * (platformPercent / 100)
            );
            const platformFeeFlatCents = Math.round(platformFlat * 100);
            platformFee =
              (platformFeePercentCents + platformFeeFlatCents) / 100;
          }
        }

        return {
          id: txn.id,
          amount: txn.amount / 100,
          fee: txn.fee / 100,
          net: txn.net / 100,
          currency: txn.currency,
          type: txn.type,
          status: txn.status,
          created: new Date(txn.created * 1000),
          platformFee,
          shipperReceives: txn.net / 100 - platformFee,
        };
      })
    );

    const totalAmount = formatted.reduce((sum, t) => sum + t.amount, 0);
    const totalNet = formatted.reduce((sum, t) => sum + t.shipperReceives, 0);
    const paginated = formatted.slice((page - 1) * limit, page * limit);

    res.status(200).json({
      success: true,
      filter: hasCustomRange ? "custom" : range || "all",
      totalTransactions: formatted.length,
      totalAmount,
      totalNet,
      data: paginated,
      pagination: buildPaginationMeta({
        total: formatted.length,
        page,
        limit,
      }),
    });
  } catch (error) {
    console.error("Stripe transactions error:", error);

    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_STRIPE_TRANSACTIONS,
    });
  }
};

/* =====================================================
   GET FUNDS AVAILABLE FOR PLATFORM BANK TRANSFER
   - Stripe available/pending balance is the source of truth
   - App ledger explains how much of that is platform income
===================================================== */
exports.getTransferAvailability = async (req, res) => {
  try {
    const { startDate, endDate, hasCustomRange } = getDateBounds(req.query);
    const ledgerDateWindow = hasCustomRange
      ? buildMongoDateWindow(startDate, endDate)
      : null;
    const balance = await stripe.balance.retrieve();
    const availableCents = sumStripeBalance(balance.available);
    const pendingCents = sumStripeBalance(balance.pending);
    const currency =
      balance.available[0]?.currency || balance.pending[0]?.currency || "usd";

    const settings = await PlatformSettings.findOne();

    const [
      completedPaidQuotes,
      pendingTransferQuotes,
      paidSubscriptions,
    ] = await Promise.all([
      ShipmentQuote.find({
        paymentStatus: "paid",
        tripStatus: "completed",
        payoutStatus: "transferred",
        ...(ledgerDateWindow
          ? {
              $or: [
                { paymentReleasedAt: ledgerDateWindow },
                { paidAt: ledgerDateWindow },
                { updatedAt: ledgerDateWindow },
              ],
            }
          : {}),
      })
        .populate("shipper", "name email companyName")
        .sort({ paymentReleasedAt: -1, updatedAt: -1 })
        .limit(25)
        .lean(),
      ShipmentQuote.find({
        paymentStatus: "paid",
        tripStatus: "completed",
        payoutStatus: { $ne: "transferred" },
        ...(ledgerDateWindow ? { updatedAt: ledgerDateWindow } : {}),
      })
        .select("totalPrice platformFee currency paymentStatus payoutStatus tripStatus")
        .lean(),
      Subscription.find({
        status: { $in: ["active", "trialing"] },
        lastPaymentDate: ledgerDateWindow || { $ne: null },
      })
        .select("amount currency interval planType status lastPaymentDate")
        .lean(),
    ]);

    const shipmentPlatformFees = completedPaidQuotes.reduce(
      (sum, quote) => sum + getPlatformFeeForQuote(quote, settings),
      0
    );

    const pendingShipperTransfers = pendingTransferQuotes.reduce(
      (sum, quote) => {
        const platformFee = getPlatformFeeForQuote(quote, settings);
        return sum + Math.max(Number(quote.totalPrice || 0) - platformFee, 0);
      },
      0
    );

    const subscriptionFees = paidSubscriptions.reduce(
      (sum, subscription) => sum + Number(subscription.amount || 0),
      0
    );

    const appLedgerPlatformFunds = shipmentPlatformFees + subscriptionFees;
    const stripeAvailable = centsToMoney(availableCents);
    const stripePending = centsToMoney(pendingCents);
    const recommendedTransferToClientBank = Math.max(
      Math.min(stripeAvailable, appLedgerPlatformFunds),
      0
    );

    const recentCompletedShipmentFees = completedPaidQuotes
      .slice(0, 10)
      .map((quote) => ({
        quoteId: quote._id,
        shipper: quote.shipper,
        shipment: quote.shipment,
        totalPrice: Number(quote.totalPrice || 0),
        platformFee: getPlatformFeeForQuote(quote, settings),
        currency: quote.currency || currency,
        paidAt: quote.paidAt || quote.paymentReleasedAt || quote.updatedAt,
        paymentReleasedAt: quote.paymentReleasedAt,
        stripePaymentIntentId: quote.stripePaymentIntentId,
        stripeTransferId: quote.stripeTransferId,
      }));

    return res.status(200).json({
      success: true,
      data: {
        currency,
        stripe: {
          available: stripeAvailable,
          pending: stripePending,
        },
        ledger: {
          subscriptionFees,
          shipmentPlatformFees,
          appLedgerPlatformFunds,
          pendingShipperTransfers,
          completedPaidTransferredShipments: completedPaidQuotes.length,
          completedPaidPendingTransferShipments: pendingTransferQuotes.length,
        },
        recommendedTransferToClientBank,
        recentCompletedShipmentFees,
        note:
          "Use Stripe available balance as the live limit. The app ledger explains expected platform-owned funds from subscriptions and completed paid shipments after shipper transfers.",
      },
    });
  } catch (error) {
    console.error("Stripe transfer availability error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transfer availability report",
    });
  }
};
