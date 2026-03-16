const Driver = require("../../../models/shipper/Driver");
const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
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
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await driver.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    if (!driver.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is deactivated. Contact shipper.",
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
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        notes: driver.notes,
        profileImage: driver.profileImage,
      },
    });
  } catch (error) {
    console.error("[DRIVER LOGIN]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DRIVER DASHBOARD (ME) WITH ASSIGNED SHIPMENTS
// ====================================================
exports.getDriverDashboard = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver._id).populate(
      "assignedVehicles"
    );
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    // Fetch accepted shipment quotes (assigned shipments)
    const acceptedQuotes = await ShipmentQuote.find({ status: "accepted" })
      .populate("shipment")
      .populate("shipper", "name email phone companyName")
      .populate("vehicle", "vehicleNumber type capacity")
      .lean();

    // Map shipments from accepted quotes
    const shipments = acceptedQuotes.map((quote) => ({
      ...quote.shipment,
      quoteId: quote._id,
      shipper: quote.shipper,
      vehicle: quote.vehicle,
      totalPrice: quote.totalPrice,
      paymentMethod: quote.paymentMethod,
      pickupTime: quote.pickupTime,
      estimatedArrivalTime: quote.estimatedArrivalTime,
    }));

    res.json({
      success: true,
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        notes: driver.notes,
        profileImage: driver.profileImage,
        assignedVehicles: driver.assignedVehicles,
      },
      shipments,
    });
  } catch (error) {
    console.error("[DRIVER DASHBOARD]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// GET ASSIGNED SHIPMENTS FOR DRIVER (WITH CUSTOMER & COORDS)
// ====================================================
exports.getDriverAssignedShipments = async (req, res) => {
  try {
    const driverId = req.driver._id;

    // Fetch all ShipmentQuotes assigned to this driver, not delivered/cancelled
    const assignedQuotes = await ShipmentQuote.find({
      assignedDriver: driverId,
      status: { $nin: ["delivered", "cancelled"] },
    })
      .populate({
        path: "shipment",
        populate: { path: "customer", select: "name phone email" },
      })
      .populate("vehicle", "vehicleName vehicleType")
      .lean();

    if (!assignedQuotes || assignedQuotes.length === 0) {
      return res.json({
        success: true,
        driverId,
        assignedShipments: [],
        message: "No assigned shipments found",
      });
    }

    // Format response
    const shipments = assignedQuotes.map((quote) => {
      const shipment = quote.shipment;
      return {
        quoteId: quote._id,
        shipmentId: shipment._id,
        shipmentCode: shipment.shipmentCode,
        status: quote.status,
        pickupAddress: shipment.pickupLocation,
        pickupCoords: shipment.pickupCoords || {},
        deliveryAddress: shipment.deliveryLocation,
        deliveryCoords: shipment.deliveryCoords || {},
        pickupTime: quote.pickupTime || shipment.pickupDate,
        estimatedArrivalTime:
          quote.estimatedArrivalTime || shipment.deliveryDate,
        transportType: quote.transportType || shipment.transportType,
        stallsRequired: quote.stallsRequired || shipment.numberOfHorses,
        notes: quote.notes || shipment.additionalInfo,
        vehicle: quote.vehicle
          ? {
              vehicleId: quote.vehicle._id,
              vehicleName: quote.vehicle.vehicleName,
              vehicleType: quote.vehicle.vehicleType,
            }
          : null,
        customer: shipment.customer
          ? {
              customerId: shipment.customer._id,
              name: shipment.customer.name,
              phone: shipment.customer.phone,
              email: shipment.customer.email,
            }
          : null,
      };
    });

    res.json({
      success: true,
      driverId,
      assignedShipments: shipments,
    });
  } catch (error) {
    console.error("[GET ASSIGNED SHIPMENTS]", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
// ====================================================
// ACCEPT SHIPMENT (SELF ASSIGN)
// ====================================================
exports.acceptShipment = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { quoteId } = req.body;

    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipment")
      .populate("shipper")
      .populate("vehicle")
      .lean();

    if (!quote)
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });

    // Update shipment quote status
    await ShipmentQuote.findByIdAndUpdate(quoteId, {
      assignedDriver: driverId,
      status: "driverAccepted",
    });

    res.json({
      success: true,
      message: "Shipment accepted successfully",
      driverId,
      shipment: {
        ...quote.shipment,
        quoteId: quote._id,
        shipper: quote.shipper,
        vehicle: quote.vehicle,
        totalPrice: quote.totalPrice,
        paymentMethod: quote.paymentMethod,
        pickupTime: quote.pickupTime,
        estimatedArrivalTime: quote.estimatedArrivalTime,
      },
    });
  } catch (error) {
    console.error("[ACCEPT SHIPMENT]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// UPDATE DRIVER PROFILE IMAGE (SELF ONLY)
// ====================================================
exports.updateDriverProfileImage = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver._id);
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "Profile image is required" });

    if (driver.profileImage?.public_id) {
      await cloudinary.uploader.destroy(driver.profileImage.public_id);
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "driver_profiles",
    });

    driver.profileImage = {
      url: result.secure_url,
      public_id: result.public_id,
    };
    await driver.save();

    res.json({
      success: true,
      message: "Profile image updated successfully",
      profileImage: driver.profileImage,
    });
  } catch (error) {
    console.error("[DRIVER IMAGE UPDATE]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DELETE DRIVER PROFILE IMAGE (SELF ONLY)
// ====================================================
exports.deleteDriverProfileImage = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver._id);
    if (!driver || !driver.profileImage?.public_id)
      return res
        .status(404)
        .json({ success: false, message: "Profile image not found" });

    await cloudinary.uploader.destroy(driver.profileImage.public_id);
    driver.profileImage = { url: null, public_id: null };
    await driver.save();

    res.json({ success: true, message: "Profile image deleted successfully" });
  } catch (error) {
    console.error("[DRIVER IMAGE DELETE]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
