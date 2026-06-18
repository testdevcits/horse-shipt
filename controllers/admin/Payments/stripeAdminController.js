const { apiResponse } = require("../../../responses/api.response");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../../models/admin/payment/platformSettings");
const { buildPaginationMeta } = require("../../../utils/adminQuery");

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

    const now = new Date();
    let startDate;

    if (range === "today") {
      startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (range === "week") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 7);
    } else if (range === "month") {
      startDate = new Date();
      startDate.setMonth(now.getMonth() - 1);
    }

    // Fetch raw Stripe transactions
    const transactions = await stripe.balanceTransactions.list({
      limit: 100,
      created: startDate
        ? { gte: Math.floor(startDate.getTime() / 1000) }
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
      filter: range || "all",
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
