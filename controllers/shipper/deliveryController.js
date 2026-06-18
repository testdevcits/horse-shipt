const { apiResponse } = require("../../responses/api.response");
// =======================================================
// IMPORTS
// =======================================================
const sendDeliveryMail = require("../../utils/sendDeliveryMail");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../models/admin/payment/platformSettings");
const Driver = require("../../models/shipper/Driver");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// =======================================================
// MARK SHIPMENT DELIVERED → GENERATE OTP
// =======================================================
exports.markShipmentDelivered = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer"
    );

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    if (shipment.status === "delivered" || shipment.deliveryOtpVerified) {
      return res.status(400).json({
        success: false,
        message: apiResponse.SHIPMENT_ALREADY_DELIVERED,
      });
    }

    if (shipment.shipper && shipment.shipper.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: apiResponse.UNAUTHORIZED_ACTION,
      });
    }

    if (!shipment.shipper) {
      shipment.shipper = req.user.id;
      await shipment.save();
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    shipment.deliveryOtp = otp.toString();
    shipment.deliveryOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await shipment.save();

    const subject = "Shipment Delivery OTP";
    const message = `

Hello ${shipment.customer.name || ""},

Your shipment has arrived.

OTP: ${otp}

This OTP will expire in 10 minutes.

HorseShipt Team
`;

    await sendDeliveryMail(shipment.customer.email, subject, message);

    return res.json({
      success: true,
      message: apiResponse.DELIVERY_OTP_SENT,
    });
  } catch (error) {
    console.error("MARK DELIVERY ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// =======================================================
// VERIFY DELIVERY OTP → RELEASE PAYMENT
// =======================================================
exports.verifyDeliveryOtp = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { otp } = req.body;

    // ================= FETCH SHIPMENT =================
    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPMENT_NOT_FOUND });
    }

    // ================= AUTH =================
    if (shipment.shipper?.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: apiResponse.UNAUTHORIZED_ACTION });
    }

    // ================= VALIDATION =================
    if (shipment.deliveryOtpVerified) {
      return res
        .status(400)
        .json({ success: false, message: apiResponse.SHIPMENT_ALREADY_DELIVERED });
    }

    if (shipment.deliveryOtp !== otp) {
      return res.status(400).json({ success: false, message: apiResponse.INVALID_OTP });
    }

    if (shipment.deliveryOtpExpires < new Date()) {
      return res.status(400).json({ success: false, message: apiResponse.OTP_EXPIRED });
    }

    // ================= FIND QUOTE =================
    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    }).populate("shipper");

    if (!quote) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.ACCEPTED_QUOTE_NOT_FOUND });
    }

    if (quote.paymentStatus !== "paid") {
      return res
        .status(400)
        .json({ success: false, message: apiResponse.PAYMENT_NOT_COMPLETED_YET });
    }

    // ================= MARK DELIVERY =================
    shipment.status = "delivered";
    shipment.deliveredAt = new Date();
    shipment.deliveryOtpVerified = true;
    shipment.deliveryOtp = null;
    shipment.deliveryOtpExpires = null;

    await shipment.save();

    // ================= FREE VEHICLE =================
    if (quote.vehicle) {

      const vehicle = await ShipperVehicle.findById(quote.vehicle);

      if (vehicle) {
        vehicle.currentShipment = null;
        vehicle.driverStatus = "AVAILABLE";

        await vehicle.save();
      } else {
      }
    } else {
    }

    // ================= FREE DRIVER =================
    if (quote.assignedDriver) {

      const driver = await Driver.findById(quote.assignedDriver);

      if (driver) {
        driver.driverStatus = "available";

        await driver.save();
      } else {
      }
    } else {
    }

    // ================= STRIPE PAYOUT =================
    try {

      const paymentIntent = await stripe.paymentIntents.retrieve(
        quote.stripePaymentIntentId
      );

      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);

      const balanceTx = await stripe.balanceTransactions.retrieve(
        charge.balance_transaction
      );

      const grossCents = paymentIntent.amount;
      const stripeFeeCents = balanceTx.fee;
      const netAfterStripeCents = grossCents - stripeFeeCents;

      const settings = await PlatformSettings.findOne();
      const platformPercent = settings?.platformFeePercent || 0;
      const platformFlat = settings?.platformFeeFlat || 0;

      const platformFee =
        Math.round(netAfterStripeCents * (platformPercent / 100)) +
        Math.round(platformFlat * 100);

      const shipperCents = netAfterStripeCents - platformFee;

      const transfer = await stripe.transfers.create({
        amount: shipperCents,
        currency: balanceTx.currency,
        destination: quote.shipper.stripeAccountId,
        source_transaction: charge.id,
      });

      quote.stripeTransferId = transfer.id;
      quote.payoutStatus = "transferred";
      quote.paymentReleasedAt = new Date();
    } catch (err) {

      quote.payoutStatus = "pending";
      quote.payoutError = err.message;
    }

    // ================= FINAL QUOTE =================
    quote.tripStatus = "completed";
    await quote.save();

    return res.json({
      success: true,
      message: apiResponse.DELIVERY_COMPLETED_PAYOUT_HANDLED_SEPARATELY,
    });
  } catch (error) {
    console.error("[VERIFY DELIVERY ERROR]:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
// =======================================================
// GET SHIPMENT DELIVERY STATUS
// =======================================================
exports.getShipmentDeliveryStatus = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    res.json({
      success: true,
      shipmentId: shipment._id,
      status: shipment.status,
      deliveryOtpVerified: shipment.deliveryOtpVerified,
      deliveredAt: shipment.deliveredAt,
    });
  } catch (error) {
    console.error("DELIVERY STATUS ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.shipperPayout = async (req, res) => {
  try {
    const shipperId = req.user.id;

    const quotes = await ShipmentQuote.find({
      shipper: shipperId,
      balanceInWallet: { $gt: 0 },
    });

    let totalPayout = 0;
    for (const quote of quotes) totalPayout += quote.balanceInWallet;

    if (totalPayout <= 0)
      return res
        .status(400)
        .json({ success: false, message: apiResponse.NO_BALANCE_TO_PAYOUT });

    // Stripe payout
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(totalPayout * 100),
        currency: "usd",
      },
      { stripeAccount: req.user.stripeAccountId }
    );

    // Reset wallet balances
    for (const quote of quotes) {
      quote.balanceInWallet = 0;
      await quote.save();
    }

    res.json({
      success: true,
      message: apiResponse.PAYOUT_REQUESTED_SUCCESSFULLY,
      payoutId: payout.id,
      amount: totalPayout,
    });
  } catch (error) {
    console.error("Shipper Payout Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getShipperStripePayoutHistory = async (req, res) => {
  try {
    if (!req.user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.STRIPE_ACCOUNT_NOT_CONNECTED,
      });
    }

    const limit = parseInt(req.query.limit) || 10;
    const startingAfter = req.query.starting_after || null;

    // Fetch transfers to this shipper account
    const transfers = await stripe.transfers.list({
      destination: req.user.stripeAccountId,
      limit: limit,
      ...(startingAfter && { starting_after: startingAfter }),
    });

    const payoutHistory = transfers.data.map((t) => ({
      id: t.id,
      amount: t.amount / 100,
      currency: t.currency,
      status: "paid",
      method: "platform_payout",
      arrivalDate: new Date(t.created * 1000),
      createdAt: new Date(t.created * 1000),
    }));

    res.json({
      success: true,
      totalTransactions: payoutHistory.length,
      hasMore: transfers.has_more,
      nextCursor: transfers.data.length
        ? transfers.data[transfers.data.length - 1].id
        : null,
      transactions: payoutHistory,
    });
  } catch (error) {
    console.error("PAYOUT HISTORY ERROR:", error);

    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_PAYOUT_HISTORY,
      error: error.message,
    });
  }
};
