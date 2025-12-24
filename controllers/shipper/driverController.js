const Driver = require("../../models/shipper/Driver");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");

// ---------------- CREATE DRIVER ----------------
exports.addDriver = async (req, res) => {
  try {
    const { name, email, password, phone, licenseNumber, notes } = req.body;

    const existingDriver = await Driver.findOne({ email });
    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: "Driver with this email already exists",
      });
    }

    const driver = await Driver.create({
      name,
      email,
      password, // Ideally hash password before saving
      phone,
      licenseNumber,
      notes,
      shipper: req.shipper._id, // assign shipper from auth middleware
    });

    res.status(201).json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- GET ALL DRIVERS ----------------
exports.getMyDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ shipper: req.shipper._id }).populate(
      "assignedVehicles"
    );
    res.json({ success: true, drivers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- ASSIGN VEHICLES TO DRIVER ----------------
exports.assignVehiclesToDriver = async (req, res) => {
  try {
    const { driverId, vehicleIds } = req.body; // array of vehicle _id

    const driver = await Driver.findOne({
      _id: driverId,
      shipper: req.shipper._id,
    });
    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Assign new vehicles (avoid duplicates)
    vehicleIds.forEach((vid) => {
      if (!driver.assignedVehicles.includes(vid)) {
        driver.assignedVehicles.push(vid);
      }
    });

    await driver.save();

    const populatedDriver = await driver.populate("assignedVehicles");

    res.json({ success: true, driver: populatedDriver });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- UPDATE DRIVER ----------------
exports.updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findOneAndUpdate(
      { _id: driverId, shipper: req.shipper._id },
      req.body,
      { new: true }
    );

    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    res.json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- DELETE DRIVER ----------------
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findOneAndDelete({
      _id: driverId,
      shipper: req.shipper._id,
    });

    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    res.json({ success: true, message: "Driver deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
