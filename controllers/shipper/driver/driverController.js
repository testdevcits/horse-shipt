const Driver = require("../../../models/shipper/Driver");
const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const ShipperVehicle = require("../../../models/shipper/ShipperVehicle");
const jwt = require("jsonwebtoken");
const cloudinary = require("../../../utils/cloudinary");
const CustomerShipment = require("../../../models/customer/CustomerShipment");
const sendDeliveryMail = require("../../../utils/sendDeliveryMail");
const platformSettings = require("../../../models/admin/payment/platformSettings");

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
    })
      .populate(
        "shipment",
        "_id shipmentCode pickupLocation deliveryLocation pickupDate deliveryDate pickupDateRange deliveryDateRange numberOfHorses horses currentLocation pickupCoords deliveryCoords status deliveredAt"
      )
      .populate("vehicle", "_id vehicleNumber vehicleType transportType trailerType numberOfStalls stallSize")
      .sort({ createdAt: -1 })
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

    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: "Quote ID is required",
      });
    }

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ✅ FIX: allow if already started / inTransit
    if (["started", "inTransit"].includes(quote.tripStatus)) {

      return res.json({
        success: true,
        message: "Trip already started",
        trackingEnabled: true,
      });
    }

    if (quote.tripStatus !== "notStarted") {
      return res.status(400).json({
        success: false,
        message: "Trip cannot be started",
      });
    }

    // START TRIP
    quote.tripStatus = "started";
    quote.isTrackingActive = true;
    quote.tripStartedAt = new Date();

    await quote.save();

    // VEHICLE UPDATE
    if (quote.vehicle) {
      await ShipperVehicle.findByIdAndUpdate(quote.vehicle, {
        currentShipment: quoteId,
        driverStatus: "BUSY",
      });
    }

    // DRIVER UPDATE
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "onTrip",
      isTrackingEnabled: true,
      lastActiveAt: new Date(),
    });

    return res.json({
      success: true,
      message: "Trip started successfully",
      trackingEnabled: true,
    });
  } catch (error) {
    console.error("[START TRIP ERROR]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to start trip",
    });
  }
};
// ====================================================
// UPDATE DRIVER LOCATION (LIVE TRACKING CORE)
// ====================================================
exports.updateDriverLocation = async (req, res) => {
  try {

    const driverId = req.driver?._id;
    const { lat, lng, speed = 0, heading = 0 } = req.body;

    // ================= VALIDATION =================
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude required",
      });
    }

    // ================= FIND DRIVER =================
    const driver = await Driver.findById(driverId);

    if (!driver || !driver.isActive) {
      return res.status(404).json({
        success: false,
        message: "Driver not found or inactive",
      });
    }

    // ================= TRACKING CHECK =================
    if (!driver.isTrackingEnabled) {
      return res.status(400).json({
        success: false,
        message: "Tracking is disabled for this driver",
      });
    }

    // ================= FIND ACTIVE SHIPMENT =================
    const activeShipment = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      tripStatus: { $in: ["started", "inTransit"] },
    });

    // ================= PREPARE LOCATION =================
    const locationPayload = {
      lat,
      lng,
      coordinates: {
        type: "Point",
        coordinates: [lng, lat],
      },
      speed,
      heading,
      updatedAt: new Date(),
    };

    // ================= UPDATE DRIVER =================
    await Driver.findByIdAndUpdate(driverId, {
      currentLocation: locationPayload,
      lastActiveAt: new Date(),
      driverStatus: activeShipment ? "onTrip" : "available",
    });

    // ================= UPDATE SHIPMENT =================
    if (activeShipment) {
      activeShipment.currentLocation = locationPayload;
      activeShipment.tripStatus = "inTransit";

      await activeShipment.save();
    }

    return res.json({
      success: true,
      message: "Location updated successfully",
      location: locationPayload,
      tripActive: !!activeShipment,
    });
  } catch (error) {
    console.error("[LOCATION UPDATE ERROR]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update location",
    });
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

    // ---------------- GET QUOTE ----------------
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

    const assignedDriverId = quote.assignedDriver?.toString();

    if (!assignedDriverId || assignedDriverId !== loggedDriverId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized driver",
      });
    }

    // ---------------- VALIDATION ----------------
    if (shipment.deliveryOtpVerified) {
      return res.status(400).json({
        success: false,
        message: "Already delivered",
      });
    }

    if (!otp || shipment.deliveryOtp !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (
      !shipment.deliveryOtpExpires ||
      shipment.deliveryOtpExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    if (quote.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment not completed yet",
      });
    }

    // ================= MARK DELIVERY FIRST =================
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
    }

    // ================= FREE DRIVER =================
    if (quote.assignedDriver) {

      const driver = await Driver.findById(quote.assignedDriver);

      if (driver) {
        driver.driverStatus = "available";
        await driver.save();
      } else {
      }
    }

    // ================= PAYOUT (NON-BLOCKING) =================
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

      const settings = await platformSettings.findOne();

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
      message: "Driver verified delivery (vehicle freed)",
    });
  } catch (error) {
    console.error("[DRIVER VERIFY ERROR]:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
