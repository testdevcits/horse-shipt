// =======================================================
// IMPORTS
// =======================================================
const express = require("express");
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

    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer"
    );
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    console.log("=== DEBUG MARK DELIVERED ===");
    console.log("req.user:", req.user);
    console.log("shipment.shipper:", shipment.shipper);
    console.log("============================");

    // Assign shipper if not assigned
    if (!shipment.shipper) {
      shipment.shipper = req.user.id;
      await shipment.save();
      console.log(`Shipment ${shipmentId} assigned to shipper ${req.user.id}`);
    }

    // Authorization check
    if (shipment.shipper.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    shipment.deliveryOtp = otp.toString();
    shipment.deliveryOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await shipment.save();

    // Send OTP email
    const subject = "Shipment Delivery OTP";
    const message = `
Hello ${shipment.customer.name || ""},

Your shipment has arrived.

Please share this OTP with the shipper to confirm delivery.

OTP: ${otp}

This OTP will expire in 10 minutes.

Thanks,
HorseShipt Team
`;
    await sendDeliveryMail(shipment.customer.email, subject, message);
    console.log(`Delivery OTP sent to ${shipment.customer.email}: ${otp}`);

    res.json({ success: true, message: "Delivery OTP sent to customer email" });
  } catch (error) {
    console.error("Generate Delivery OTP Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// =======================================================
// VERIFY DELIVERY OTP → CREDIT WALLET (UPDATED)
// =======================================================
exports.verifyDeliveryOtp = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { otp } = req.body;

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    // Check if current shipper is authorized
    if (shipment.shipper?.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });

    // Check OTP validity
    if (shipment.deliveryOtp !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    if (shipment.deliveryOtpExpires < new Date())
      return res.status(400).json({ success: false, message: "OTP expired" });

    // Check if already verified
    if (shipment.deliveryOtpVerified)
      return res.status(200).json({
        success: true,
        message: "Delivery already verified",
      });

    // Find accepted quote
    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    });

    if (!quote)
      return res
        .status(404)
        .json({ success: false, message: "Accepted quote not found" });

    // Ensure payment is completed before crediting wallet
    if (quote.paymentStatus !== "paid")
      return res.status(400).json({
        success: false,
        message:
          "Payment not completed yet. Wallet credit will happen after payment success.",
      });

    // mark shipment delivered
    shipment.set({
      deliveryOtpVerified: true,
      status: "delivered",
      deliveredAt: new Date(),
    });
    await shipment.save();

    // calculate platform fee & wallet credit
    const settings = await PlatformSettings.findOne();
    let platformFee = 0;
    let walletAmount = quote.totalPrice;

    if (settings) {
      const percentFee = (quote.totalPrice * settings.platformFeePercent) / 100;
      const flatFee = settings.platformFeeFlat || 0;
      platformFee = percentFee + flatFee;
      walletAmount = quote.totalPrice - platformFee;
    }

    // Only credit if not already credited
    if (!quote.balanceCredited) {
      quote.balanceInWallet = (quote.balanceInWallet || 0) + walletAmount;
      quote.platformFee = platformFee;
      quote.balanceCredited = true; // flag to prevent double credit
      await quote.save();
    }

    console.log(
      `Delivery confirmed for shipment ${shipmentId}. Wallet credited: ${walletAmount}, Platform fee: ${platformFee}`
    );

    res.json({
      success: true,
      message: "Delivery confirmed & amount credited to wallet",
      walletAmount,
      platformFee,
    });
  } catch (error) {
    console.error("Verify Delivery OTP Wallet Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// =======================================================
// SHIPPER REQUEST PAYOUT
// =======================================================
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

// =======================================================
// SHIPPER CHECK DELIVERY STATUS
// =======================================================
exports.getShipmentDeliveryStatus = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    res.json({
      success: true,
      shipmentId: shipment._id,
      status: shipment.status,
      deliveryOtpVerified: shipment.deliveryOtpVerified,
      deliveredAt: shipment.deliveredAt,
    });
  } catch (error) {
    console.error("Delivery Status Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
