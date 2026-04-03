const Driver = require("../../../models/shipper/Driver");
const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const ShipperVehicle = require("../../../models/shipper/ShipperVehicle");
const jwt = require("jsonwebtoken");
const cloudinary = require("../../../utils/cloudinary");
const CustomerShipment = require("../../../models/customer/CustomerShipment");
const sendDeliveryMail = require("../../../utils/sendDeliveryMail");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// ====================================================
// DRIVER LOGIN
// ====================================================
exports.driverLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const driver = await Driver.findOne({ email });
    if (!driver) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await driver.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!driver.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    const token = jwt.sign(
      { id: driver._id, role: "driver" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      driver,
    });
  } catch (error) {
    console.error("[DRIVER LOGIN]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// GET DRIVER ASSIGNED SHIPMENTS (FIXED)
// ====================================================
exports.getDriverAssignedShipments = async (req, res) => {
  try {
    const driverId = req.driver._id;

    const shipments = await ShipmentQuote.find({
      assignedDriver: driverId,
      tripStatus: { $in: ["notStarted", "started", "inTransit"] },
    })
      .populate("shipment")
      .populate("vehicle")
      .lean();

    res.json({
      success: true,
      shipments,
    });
  } catch (error) {
    console.error("[GET SHIPMENTS]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DRIVER ACCEPT SHIPMENT
// ====================================================
exports.acceptShipment = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { quoteId } = req.body;

    // check already busy
    const busy = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      status: { $in: ["driverAccepted", "inTransit"] },
    });

    if (busy) {
      return res.status(400).json({
        success: false,
        message: "You already have an active shipment",
      });
    }

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    await ShipmentQuote.findByIdAndUpdate(quoteId, {
      assignedDriver: driverId,
      status: "driverAccepted",
    });

    res.json({
      success: true,
      message: "Shipment accepted successfully",
    });
  } catch (error) {
    console.error("[ACCEPT SHIPMENT]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// START TRIP (IMPORTANT)
// ====================================================
exports.startTrip = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { quoteId } = req.body;

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    if (quote.tripStatus !== "notStarted") {
      return res.status(400).json({
        success: false,
        message: "Trip cannot be started",
      });
    }

    quote.tripStatus = "started";
    quote.isTrackingActive = true;
    quote.tripStartedAt = new Date();

    await quote.save();

    // update vehicle
    await ShipperVehicle.findByIdAndUpdate(quote.vehicle, {
      currentShipment: quoteId,
      driverStatus: "BUSY",
    });

    // update driver
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "onTrip",
    });

    res.json({
      success: true,
      message: "Trip started successfully",
    });
  } catch (error) {
    console.error("[START TRIP]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// UPDATE DRIVER LOCATION (LIVE TRACKING CORE)
// ====================================================
exports.updateDriverLocation = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude required",
      });
    }

    // find active shipment
    const activeShipment = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      tripStatus: { $in: ["started", "inTransit"] },
    });

    if (!activeShipment) {
      return res.status(400).json({
        success: false,
        message: "No active trip found",
      });
    }

    // update driver location
    await Driver.findByIdAndUpdate(driverId, {
      currentLocation: {
        lat,
        lng,
        updatedAt: new Date(),
      },
      lastActiveAt: new Date(),
    });

    // update shipment location (for customer tracking)
    activeShipment.currentLocation = {
      lat,
      lng,
      updatedAt: new Date(),
    };

    activeShipment.tripStatus = "inTransit";

    await activeShipment.save();

    res.json({
      success: true,
      message: "Location updated",
      location: activeShipment.currentLocation,
    });
  } catch (error) {
    console.error("[LOCATION UPDATE]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// COMPLETE SHIPMENT
// ====================================================
exports.completeShipment = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { quoteId } = req.body;

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ================= UPDATE SHIPMENT =================
    quote.tripStatus = "completed";
    quote.deliveredAt = new Date();
    quote.isTrackingActive = false;

    await quote.save();

    // ================= FREE VEHICLE =================
    await ShipperVehicle.findByIdAndUpdate(quote.vehicle, {
      currentShipment: null,
      driverStatus: "AVAILABLE",
    });

    // ================= FREE DRIVER =================
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "available",
    });

    // ================= RESPONSE =================
    return res.json({
      success: true,
      message: "Shipment completed successfully",
      data: {
        quoteId: quote._id,
        deliveredAt: quote.deliveredAt,
      },
    });
  } catch (error) {
    console.error("[COMPLETE SHIPMENT]", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ====================================================
// DRIVER DASHBOARD
// ====================================================
exports.getDriverDashboard = async (req, res) => {
  try {
    const driverId = req.driver._id;

    // ================= DRIVER =================
    const driver = await Driver.findById(driverId).select(
      "_id name email phone licenseNumber role profileImage driverStatus assignedVehicles isActive"
    );
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    // ================= VEHICLE =================
    const vehicle = await ShipperVehicle.findOne({ driver: driverId })
      .select(
        "_id vehicleNumber vehicleType transportType trailerType numberOfStalls stallSize driverStatus currentShipment notes images"
      )
      .populate(
        "driver",
        "_id name email phone licenseNumber role profileImage driverStatus"
      );

    // ================= ALL SHIPMENTS =================
    let allShipments = await ShipmentQuote.find({ assignedDriver: driverId })
      .select(
        "_id tripStatus totalPrice paymentStatus pickupTime estimatedArrivalTime transportType stallsRequired notes status"
      )
      .populate("vehicle", "_id vehicleNumber vehicleType transportType")
      .populate(
        "shipment",
        "_id pickupLocation deliveryLocation pickupDate deliveryDate numberOfHorses horses currentLocation pickupCoords deliveryCoords"
      );

    // ================= ACTIVE SHIPMENT =================
    let activeShipment = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      tripStatus: { $in: ["notStarted", "started", "inTransit"] },
    })
      .select(
        "_id tripStatus totalPrice paymentStatus pickupTime estimatedArrivalTime transportType stallsRequired notes status"
      )
      .populate("vehicle", "_id vehicleNumber vehicleType transportType")
      .populate(
        "shipment",
        "_id pickupLocation deliveryLocation pickupDate deliveryDate numberOfHorses horses currentLocation pickupCoords deliveryCoords"
      );

    // ================= MAP-FRIENDLY FORMAT =================
    const mapCoords = (shipment) => {
      if (!shipment?.shipment) return null;
      const { shipment: sh } = shipment;
      return {
        ...shipment._doc,
        shipment: {
          ...sh._doc,
          pickupLat: sh.pickupCoords?.latitude || null,
          pickupLng: sh.pickupCoords?.longitude || null,
          deliveryLat: sh.deliveryCoords?.latitude || null,
          deliveryLng: sh.deliveryCoords?.longitude || null,
        },
      };
    };

    allShipments = allShipments.map(mapCoords);
    activeShipment = mapCoords(activeShipment);

    return res.json({
      success: true,
      driver,
      vehicle,
      shipment: activeShipment || null,
      allShipments,
    });
  } catch (error) {
    console.error("[DRIVER DASHBOARD ERROR]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// ====================================================
// UPDATE DRIVER PROFILE IMAGE
// ====================================================
exports.updateDriverProfileImage = async (req, res) => {
  try {
    const driverId = req.driver._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      { profileImage: req.file.path },
      { new: true }
    );

    res.json({
      success: true,
      message: "Profile image updated",
      driver,
    });
  } catch (error) {
    console.error("[UPDATE DRIVER IMAGE]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DELETE DRIVER PROFILE IMAGE
// ====================================================
exports.deleteDriverProfileImage = async (req, res) => {
  try {
    const driverId = req.driver._id;

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      { profileImage: null },
      { new: true }
    );

    res.json({
      success: true,
      message: "Profile image removed",
      driver,
    });
  } catch (error) {
    console.error("[DELETE DRIVER IMAGE]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.driverSendDeliveryOtp = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    // ---------------- GET SHIPMENT ----------------
    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer"
    );

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ---------------- GET ACCEPTED QUOTE ----------------
    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    }).populate({
      path: "vehicle",
      populate: {
        path: "driver",
      },
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Accepted quote not found",
      });
    }

    const loggedDriverId = req.driver?._id;

    // Debug logs
    console.log(
      "Quote Driver:",
      quote.assignedDriver?.toString() || quote.vehicle?.driver?._id?.toString()
    );
    console.log("Logged Driver:", loggedDriverId?.toString());

    // ---------------- DRIVER CHECK ----------------
    const assignedDriverId = quote.assignedDriver || quote.vehicle?.driver?._id;

    if (
      !assignedDriverId ||
      assignedDriverId.toString() !== loggedDriverId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized driver",
      });
    }

    // ---------------- DELIVERY STATUS CHECK ----------------
    if (shipment.status === "delivered" || shipment.deliveryOtpVerified) {
      return res.status(400).json({
        success: false,
        message: "Shipment already delivered",
      });
    }

    // ---------------- GENERATE OTP ----------------
    const otp = Math.floor(100000 + Math.random() * 900000);

    shipment.deliveryOtp = otp.toString();
    shipment.deliveryOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await shipment.save();

    // ---------------- EMAIL ----------------
    const subject = "Shipment Delivery OTP";

    const message = `
Hello ${shipment.customer?.name || ""},

Your shipment has arrived.

OTP: ${otp}

This OTP will expire in 10 minutes.

HorseShipt Team
`;

    await sendDeliveryMail(shipment.customer?.email, subject, message);

    return res.status(200).json({
      success: true,
      message: "Driver sent delivery OTP",
    });
  } catch (error) {
    console.error("DRIVER OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.driverVerifyDeliveryOtp = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { otp } = req.body;

    // ---------------- GET SHIPMENT ----------------
    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const loggedDriverId = req.driver?._id?.toString();

    // ---------------- GET ACCEPTED QUOTE ----------------
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

    // ---------------- DRIVER VALIDATION ----------------
    const assignedDriverId = quote.assignedDriver?.toString();

    // DEBUG LOGS (VERY IMPORTANT)
    console.log("===== DRIVER VERIFY DEBUG =====");
    console.log("Logged Driver:", loggedDriverId);
    console.log("Assigned Driver:", assignedDriverId);
    console.log("================================");

    if (!assignedDriverId || assignedDriverId !== loggedDriverId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized driver",
      });
    }

    // ---------------- DELIVERY STATUS ----------------
    if (shipment.deliveryOtpVerified) {
      return res.status(400).json({
        success: false,
        message: "Already delivered",
      });
    }

    // ---------------- OTP VALIDATION ----------------
    if (!otp || shipment.deliveryOtp !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // ---------------- OTP EXPIRY ----------------
    if (
      !shipment.deliveryOtpExpires ||
      shipment.deliveryOtpExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    // ---------------- PAYMENT CHECK ----------------
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
    // STRIPE
    // ============================================

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

    // ============================================
    // PLATFORM SETTINGS
    // ============================================

    const settings = await PlatformSettings.findOne();

    const platformPercent = settings?.platformFeePercent || 0;
    const platformFlat = settings?.platformFeeFlat || 0;

    const platformFeePercentCents = Math.round(
      netAfterStripeCents * (platformPercent / 100)
    );

    const platformFeeFlatCents = Math.round(platformFlat * 100);

    const platformFeeTotalCents =
      platformFeePercentCents + platformFeeFlatCents;

    const shipperCents = netAfterStripeCents - platformFeeTotalCents;

    if (shipperCents <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payout",
      });
    }

    // ============================================
    // TRANSFER
    // ============================================

    const transfer = await stripe.transfers.create({
      amount: shipperCents,
      currency: balanceTx.currency,
      destination: quote.shipper.stripeAccountId,
      source_transaction: charge.id,
      metadata: {
        shipmentId: shipment._id.toString(),
        quoteId: quote._id.toString(),
      },
    });

    // ============================================
    // UPDATE QUOTE
    // ============================================

    quote.stripeTransferId = transfer.id;
    quote.payoutStatus = "transferred";
    quote.paymentReleasedAt = new Date();

    quote.grossAmount = grossCents / 100;
    quote.stripeFee = stripeFeeCents / 100;
    quote.platformFee = platformFeeTotalCents / 100;
    quote.netAmount = shipperCents / 100;

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
      message: "Driver verified delivery & payout sent",
    });
  } catch (error) {
    console.error("DRIVER VERIFY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
