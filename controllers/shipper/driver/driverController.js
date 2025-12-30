const Driver = require("../../../models/shipper/Driver");
const Shipment = require("../../../models/shipper/ShipperShipment");
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

    // Fetch assigned shipments
    const assignedShipments = await Shipment.find({
      assignedDriver: driver._id,
    })
      .populate("pickupLocation", "address city state postalCode")
      .populate("dropLocation", "address city state postalCode")
      .lean();

    // Fetch ShipmentQuotes
    const shipmentIds = assignedShipments.map((s) => s._id);
    const shipmentQuotes = await ShipmentQuote.find({
      shipment: { $in: shipmentIds },
    })
      .populate("shipper", "name email phone")
      .populate("vehicle", "vehicleNumber type capacity")
      .lean();

    // Attach quotes to shipments
    const shipmentsWithQuotes = assignedShipments.map((shipment) => {
      return {
        ...shipment,
        pickupDate: shipment.pickupDate,
        deliveryDate: shipment.deliveryDate,
        quotes: shipmentQuotes.filter(
          (quote) => quote.shipment.toString() === shipment._id.toString()
        ),
      };
    });

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
      shipments: shipmentsWithQuotes,
    });
  } catch (error) {
    console.error("[DRIVER ME]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// ACCEPT SHIPMENT (SELF ASSIGN)
// ====================================================
exports.acceptShipment = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { shipmentId } = req.body;

    const shipment = await Shipment.findById(shipmentId)
      .populate("pickupLocation", "address city state postalCode")
      .populate("dropLocation", "address city state postalCode")
      .lean();
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    // Assign driver and update status
    await Shipment.findByIdAndUpdate(shipmentId, {
      assignedDriver: driverId,
      status: "Accepted",
    });

    // Fetch driver info
    const driver = await Driver.findById(driverId).populate("assignedVehicles");

    // Fetch ShipmentQuotes for this shipment
    const shipmentQuotes = await ShipmentQuote.find({ shipment: shipment._id })
      .populate("shipper", "name email phone")
      .populate("vehicle", "vehicleNumber type capacity")
      .lean();

    shipment.quotes = shipmentQuotes;

    res.json({
      success: true,
      message: "Shipment accepted successfully",
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
      shipment,
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
