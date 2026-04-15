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

    console.log("=====================================");
    console.log("[VERIFY DELIVERY OTP] Start", { shipmentId, otp });

    // ================= FETCH SHIPMENT =================
    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      console.log("[ERROR] Shipment not found");
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    console.log("[SHIPMENT FOUND]", {
      id: shipment._id,
      status: shipment.status,
      otpVerified: shipment.deliveryOtpVerified,
    });

    // ================= AUTH =================
    if (shipment.shipper?.toString() !== req.user.id) {
      console.log("[ERROR] Unauthorized shipper", {
        shipmentShipper: shipment.shipper,
        loggedUser: req.user.id,
      });
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized action" });
    }

    // ================= VALIDATION =================
    if (shipment.deliveryOtpVerified) {
      console.log("[ERROR] Already delivered");
      return res
        .status(400)
        .json({ success: false, message: "Shipment already delivered" });
    }

    if (shipment.deliveryOtp !== otp) {
      console.log("[ERROR] Invalid OTP", {
        expected: shipment.deliveryOtp,
        received: otp,
      });
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (shipment.deliveryOtpExpires < new Date()) {
      console.log("[ERROR] OTP expired", {
        expiresAt: shipment.deliveryOtpExpires,
      });
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    console.log("[OTP VERIFIED SUCCESSFULLY]");

    // ================= FIND QUOTE =================
    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    }).populate("shipper");

    if (!quote) {
      console.log("[ERROR] Quote not found");
      return res
        .status(404)
        .json({ success: false, message: "Accepted quote not found" });
    }

    console.log("[QUOTE FOUND]", {
      quoteId: quote._id,
      vehicle: quote.vehicle,
      driver: quote.assignedDriver,
      paymentStatus: quote.paymentStatus,
      payoutStatus: quote.payoutStatus,
    });

    if (quote.paymentStatus !== "paid") {
      console.log("[ERROR] Payment not completed");
      return res
        .status(400)
        .json({ success: false, message: "Payment not completed yet" });
    }

    // ================= MARK DELIVERY =================
    shipment.status = "delivered";
    shipment.deliveredAt = new Date();
    shipment.deliveryOtpVerified = true;
    shipment.deliveryOtp = null;
    shipment.deliveryOtpExpires = null;

    await shipment.save();

    console.log("[SHIPMENT DELIVERED]", shipment._id);

    // ================= FREE VEHICLE =================
    if (quote.vehicle) {
      console.log("[FREE VEHICLE START]", quote.vehicle);

      const vehicle = await ShipperVehicle.findById(quote.vehicle);

      if (vehicle) {
        console.log("[VEHICLE BEFORE FREE]", {
          currentShipment: vehicle.currentShipment,
          driverStatus: vehicle.driverStatus,
        });

        vehicle.currentShipment = null;
        vehicle.driverStatus = "AVAILABLE";

        await vehicle.save();

        console.log("[VEHICLE FREED SUCCESS]", {
          vehicleId: vehicle._id,
          currentShipment: vehicle.currentShipment,
        });
      } else {
        console.log("[WARNING] Vehicle not found");
      }
    } else {
      console.log("[WARNING] No vehicle linked to quote");
    }

    // ================= FREE DRIVER =================
    if (quote.assignedDriver) {
      console.log("[FREE DRIVER START]", quote.assignedDriver);

      const driver = await Driver.findById(quote.assignedDriver);

      if (driver) {
        console.log("[DRIVER BEFORE FREE]", {
          status: driver.driverStatus,
        });

        driver.driverStatus = "available";

        await driver.save();

        console.log("[DRIVER FREED SUCCESS]", {
          driverId: driver._id,
          status: driver.driverStatus,
        });
      } else {
        console.log("[WARNING] Driver not found");
      }
    } else {
      console.log("[WARNING] No driver linked to quote");
    }

    // ================= STRIPE PAYOUT =================
    try {
      console.log("[STRIPE] Start payout");

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

      console.log("[STRIPE CALCULATION]", {
        grossCents,
        stripeFeeCents,
        netAfterStripeCents,
      });

      const settings = await PlatformSettings.findOne();
      const platformPercent = settings?.platformFeePercent || 0;
      const platformFlat = settings?.platformFeeFlat || 0;

      const platformFee =
        Math.round(netAfterStripeCents * (platformPercent / 100)) +
        Math.round(platformFlat * 100);

      const shipperCents = netAfterStripeCents - platformFee;

      console.log("[PAYOUT CALCULATED]", {
        platformFee,
        shipperCents,
      });

      const transfer = await stripe.transfers.create({
        amount: shipperCents,
        currency: balanceTx.currency,
        destination: quote.shipper.stripeAccountId,
        source_transaction: charge.id,
      });

      console.log("[TRANSFER SUCCESS]", transfer.id);

      quote.stripeTransferId = transfer.id;
      quote.payoutStatus = "transferred";
      quote.paymentReleasedAt = new Date();
    } catch (err) {
      console.log("[TRANSFER FAILED]", err.message);

      quote.payoutStatus = "pending";
      quote.payoutError = err.message;
    }

    // ================= FINAL QUOTE =================
    quote.tripStatus = "completed";
    await quote.save();

    console.log("[QUOTE FINAL UPDATED]", quote._id);

    console.log("=====================================");

    return res.json({
      success: true,
      message: "Delivery completed (payout handled separately)",
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

exports.getShipperStripePayoutHistory = async (req, res) => {
  try {
    if (!req.user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: "Stripe account not connected",
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
      message: "Failed to fetch payout history",
      error: error.message,
    });
  }
};
