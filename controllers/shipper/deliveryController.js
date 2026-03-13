// =======================================================
// IMPORTS
// =======================================================
const sendDeliveryMail = require("../../utils/sendDeliveryMail");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../models/admin/payment/platformSettings");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// =======================================================
// MARK SHIPMENT DELIVERED → GENERATE OTP
// =======================================================
exports.markShipmentDelivered = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    console.log("MARK DELIVERY REQUEST:", shipmentId);

    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer"
    );

    if (!shipment) {
      console.log("Shipment not found");
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    if (shipment.status === "delivered" || shipment.deliveryOtpVerified) {
      console.log("Shipment already delivered");
      return res.status(400).json({
        success: false,
        message: "Shipment already delivered",
      });
    }

    if (shipment.shipper && shipment.shipper.toString() !== req.user.id) {
      console.log("Unauthorized shipper");
      return res.status(403).json({
        success: false,
        message: "Unauthorized action",
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

    console.log("OTP generated:", otp);

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
      message: "Delivery OTP sent",
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

    console.log("VERIFY DELIVERY OTP START");

    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    if (shipment.shipper?.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    if (shipment.deliveryOtpVerified) {
      return res
        .status(400)
        .json({ success: false, message: "Shipment already delivered" });
    }

    if (shipment.deliveryOtp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (shipment.deliveryOtpExpires < new Date()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // ============================================
    // FIND ACCEPTED QUOTE
    // ============================================

    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    }).populate("shipper");

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Accepted quote not found",
      });
    }

    if (quote.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment not completed yet",
      });
    }

    if (quote.payoutStatus === "transferred") {
      return res.status(400).json({
        success: false,
        message: "Payout already processed",
      });
    }

    // ============================================
    // GET STRIPE PAYMENT DETAILS
    // ============================================

    const paymentIntent = await stripe.paymentIntents.retrieve(
      quote.stripePaymentIntentId
    );

    const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);

    const balanceTx = await stripe.balanceTransactions.retrieve(
      charge.balance_transaction
    );

    const grossAmount = balanceTx.amount / 100;
    const stripeFee = balanceTx.fee / 100;

    console.log("Gross:", grossAmount);
    console.log("Stripe Fee:", stripeFee);

    // ============================================
    // GET PLATFORM SETTINGS
    // ============================================

    const settings = await PlatformSettings.findOne();

    const platformPercent = settings?.platformFeePercent || 0;
    const platformFlat = settings?.platformFeeFlat || 0;

    const platformFeePercentAmount = (grossAmount * platformPercent) / 100;

    const platformFeeTotal = platformFeePercentAmount + platformFlat;

    console.log("Platform Fee:", platformFeeTotal);

    // ============================================
    // FINAL SHIPPER PAYOUT
    // ============================================

    const shipperAmount = grossAmount - stripeFee - platformFeeTotal;

    if (shipperAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payout calculation",
      });
    }

    const payoutCents = Math.round(shipperAmount * 100);

    console.log("Shipper Payout:", shipperAmount);

    // ============================================
    // STRIPE TRANSFER
    // ============================================

    const transfer = await stripe.transfers.create({
      amount: payoutCents,
      currency: balanceTx.currency,
      destination: quote.shipper.stripeAccountId,
      metadata: {
        shipmentId: shipment._id.toString(),
        quoteId: quote._id.toString(),
      },
    });

    console.log("TRANSFER SUCCESS:", transfer.id);

    // ============================================
    // UPDATE QUOTE
    // ============================================

    quote.stripeTransferId = transfer.id;
    quote.payoutStatus = "transferred";
    quote.paymentReleasedAt = new Date();

    quote.grossAmount = grossAmount;
    quote.stripeFee = stripeFee;
    quote.platformFee = platformFeeTotal;
    quote.netAmount = shipperAmount;

    await quote.save();

    // ============================================
    // UPDATE SHIPMENT
    // ============================================

    shipment.status = "delivered";
    shipment.deliveredAt = new Date();

    shipment.deliveryOtpVerified = true;
    shipment.deliveryOtp = null;
    shipment.deliveryOtpExpires = null;

    await shipment.save();

    return res.json({
      success: true,
      message: "Delivery verified & payout sent",

      payoutDetails: {
        grossAmount,
        stripeFee,
        platformFee: platformFeeTotal,
        shipperReceived: shipperAmount,
        currency: balanceTx.currency,
      },
    });
  } catch (error) {
    console.error("VERIFY DELIVERY ERROR:", error);

    res.status(500).json({
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

    console.log("GET DELIVERY STATUS:", shipmentId);

    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
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
        .json({ success: false, message: "No balance to payout" });

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

    console.log(
      `Shipper payout requested: ${totalPayout} USD, payoutId: ${payout.id}`
    );

    res.json({
      success: true,
      message: "Payout requested successfully",
      payoutId: payout.id,
      amount: totalPayout,
    });
  } catch (error) {
    console.error("Shipper Payout Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
