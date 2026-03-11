const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =====================================================
   GET STRIPE BALANCE
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
      message: "Failed to fetch Stripe balance",
    });
  }
};

/* =====================================================
   GET STRIPE TRANSACTIONS WITH FILTER (today/week/month)
===================================================== */
exports.getStripeTransactions = async (req, res) => {
  try {
    const { range } = req.query; // today | week | month

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

    const transactions = await stripe.balanceTransactions.list({
      limit: 50,
      created: startDate
        ? { gte: Math.floor(startDate.getTime() / 1000) }
        : undefined,
    });

    const formatted = transactions.data.map((txn) => ({
      id: txn.id,
      amount: txn.amount / 100,
      fee: txn.fee / 100,
      net: txn.net / 100,
      currency: txn.currency,
      type: txn.type,
      status: txn.status,
      created: new Date(txn.created * 1000),
    }));

    const totalAmount = formatted.reduce((sum, t) => sum + t.amount, 0);

    res.status(200).json({
      success: true,
      filter: range || "all",
      totalTransactions: formatted.length,
      totalAmount,
      data: formatted,
    });
  } catch (error) {
    console.error("Stripe transactions error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch Stripe transactions",
    });
  }
};
