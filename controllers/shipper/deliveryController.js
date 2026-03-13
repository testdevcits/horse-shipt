// =======================================================
// IMPORTS
// =======================================================
const sendDeliveryMail = require("../../utils/sendDeliveryMail");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
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
    console.log("Shipment:", shipmentId);
    console.log("OTP:", otp);

    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      console.log("Shipment not found");
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    if (shipment.shipper?.toString() !== req.user.id) {
      console.log("Unauthorized shipper");
      return res.status(403).json({
        success: false,
        message: "Unauthorized action",
      });
    }

    if (shipment.deliveryOtpVerified) {
      console.log("Shipment already delivered");
      return res.status(400).json({
        success: false,
        message: "Shipment already delivered",
      });
    }

    if (shipment.deliveryOtp !== otp) {
      console.log("Invalid OTP");
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (shipment.deliveryOtpExpires < new Date()) {
      console.log("OTP expired");
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    // ===================================================
    // FIND ACCEPTED QUOTE
    // ===================================================

    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    }).populate("shipper");

    if (!quote) {
      console.log("Accepted quote not found");
      return res.status(404).json({
        success: false,
        message: "Accepted quote not found",
      });
    }

    console.log("QUOTE FOUND:", quote._id);

    if (quote.paymentStatus !== "paid") {
      console.log("Payment not completed");
      return res.status(400).json({
        success: false,
        message: "Payment not completed yet",
      });
    }

    if (quote.payoutStatus === "transferred") {
      console.log("Payment already processed");
      return res.status(400).json({
        success: false,
        message: "Payment already processed",
      });
    }

    // ===================================================
    // GET STRIPE PAYMENT DETAILS
    // ===================================================

    let grossAmount = 0;
    let stripeFee = 0;
    let netAmount = 0;
    let currency = "usd";
    let paymentIntentId = null;

    if (quote.stripePaymentIntentId) {
      console.log("Fetching paymentIntent:", quote.stripePaymentIntentId);

      const paymentIntent = await stripe.paymentIntents.retrieve(
        quote.stripePaymentIntentId
      );

      paymentIntentId = paymentIntent.id;

      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);

      const balanceTx = await stripe.balanceTransactions.retrieve(
        charge.balance_transaction
      );

      grossAmount = balanceTx.amount;
      stripeFee = balanceTx.fee;
      netAmount = balanceTx.net;
      currency = balanceTx.currency;

      console.log("PAYMENT DETAILS:");
      console.log("Gross:", grossAmount);
      console.log("Stripe Fee:", stripeFee);
      console.log("Net:", netAmount);
    }

    // ===================================================
    // UPDATE QUOTE
    // ===================================================

    quote.payoutStatus = "transferred";
    quote.paymentReleasedAt = new Date();

    if (grossAmount) {
      quote.platformFee = stripeFee / 100;
      quote.balanceInWallet = netAmount / 100;
    }

    await quote.save();

    console.log("QUOTE UPDATED");

    // ===================================================
    // UPDATE SHIPMENT
    // ===================================================

    shipment.status = "delivered";
    shipment.deliveredAt = new Date();

    shipment.deliveryOtpVerified = true;
    shipment.deliveryOtp = null;
    shipment.deliveryOtpExpires = null;

    await shipment.save();

    console.log("SHIPMENT MARKED DELIVERED");

    return res.json({
      success: true,
      message: "Delivery verified successfully",

      paymentDetails: {
        shipmentId: shipment._id,
        paymentIntentId: paymentIntentId,
        grossAmount: grossAmount ? grossAmount / 100 : 0,
        stripeFee: stripeFee ? stripeFee / 100 : 0,
        netPaidToShipper: netAmount ? netAmount / 100 : 0,
        currency: currency,
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
