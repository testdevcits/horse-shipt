const Driver = require("../../../models/shipper/Driver");
const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const ShipperVehicle = require("../../../models/shipper/ShipperVehicle");
const jwt = require("jsonwebtoken");
const cloudinary = require("../../../utils/cloudinary");

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

    console.log("=====================================");
    console.log("[DRIVER DASHBOARD] START");
    console.log("Driver ID:", driverId);

    // ================= DRIVER =================
    const driver = await Driver.findById(driverId).select("-password");
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }
    console.log("Driver Found:", !!driver);

    // ================= VEHICLE =================
    const vehicle = await ShipperVehicle.findOne({ driver: driverId }).populate(
      "driver",
      "-password"
    ); // Include driver details

    console.log("Vehicle Found:", !!vehicle);

    // ================= ALL SHIPMENTS =================
    const allShipments = await ShipmentQuote.find({ assignedDriver: driverId })
      .populate("vehicle")
      .populate("shipment");

    console.log("Total Shipments for Driver:", allShipments.length);

    // ================= ACTIVE SHIPMENT =================
    const activeShipment = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      tripStatus: { $in: ["notStarted", "started", "inTransit"] },
    })
      .populate("shipment")
      .populate("vehicle");

    console.log("Active Shipment Found:", !!activeShipment);

    console.log("=====================================");

    return res.json({
      success: true,
      driver,
      vehicle,
      shipment: activeShipment || null,
      allShipments,
    });
  } catch (error) {
    console.error("[DRIVER DASHBOARD ERROR]", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
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
