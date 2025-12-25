const Driver = require("../../models/shipper/Driver");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");

// ---------------- CREATE DRIVER ----------------
exports.addDriver = async (req, res) => {
  try {
    console.log("[ADD DRIVER] req.body:", req.body);
    console.log("[ADD DRIVER] req.shipper:", req.shipper);

    const { name, email, password, phone, licenseNumber, notes } = req.body;

    // ----------------- Check if driver already exists -----------------
    const existingDriver = await Driver.findOne({ email });
    if (existingDriver) {
      console.log("[ADD DRIVER] Driver already exists:", email);
      return res.status(400).json({
        success: false,
        message: "Driver with this email already exists",
      });
    }

    // ----------------- Create new driver -----------------
    const driver = new Driver({
      name,
      email,
      password, // will be hashed automatically by schema
      phone,
      licenseNumber,
      notes,
      shipper: req.shipper._id, // assign shipper from auth middleware
    });

    await driver.save(); // use save() instead of create() to trigger pre-save hooks

    console.log("[ADD DRIVER] Driver created:", driver._id);
    res.status(201).json({ success: true, driver });
  } catch (error) {
    console.error("[ADD DRIVER] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- GET ALL DRIVERS ----------------
exports.getMyDrivers = async (req, res) => {
  try {
    console.log("[GET DRIVERS] req.shipper:", req.shipper);

    const drivers = await Driver.find({ shipper: req.shipper._id }).populate(
      "assignedVehicles"
    );

    console.log("[GET DRIVERS] Fetched drivers:", drivers.length);
    res.json({ success: true, drivers });
  } catch (error) {
    console.error("[GET DRIVERS] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- ASSIGN VEHICLES TO DRIVER ----------------
exports.assignVehiclesToDriver = async (req, res) => {
  try {
    const { driverId, vehicleIds } = req.body;
    console.log("[ASSIGN VEHICLES] driverId:", driverId);
    console.log("[ASSIGN VEHICLES] vehicleIds:", vehicleIds);
    console.log("[ASSIGN VEHICLES] req.shipper:", req.shipper);

    const driver = await Driver.findOne({
      _id: driverId,
      shipper: req.shipper._id,
    });
    if (!driver) {
      console.log("[ASSIGN VEHICLES] Driver not found");
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

    console.log(
      "[ASSIGN VEHICLES] Assigned vehicles:",
      populatedDriver.assignedVehicles.length
    );
    res.json({ success: true, driver: populatedDriver });
  } catch (error) {
    console.error("[ASSIGN VEHICLES] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- UPDATE DRIVER ----------------
exports.updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    console.log("[UPDATE DRIVER] driverId:", driverId);
    console.log("[UPDATE DRIVER] req.body:", req.body);
    console.log("[UPDATE DRIVER] req.shipper:", req.shipper);

    const driver = await Driver.findOneAndUpdate(
      { _id: driverId, shipper: req.shipper._id },
      req.body,
      { new: true }
    );

    if (!driver) {
      console.log("[UPDATE DRIVER] Driver not found");
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    console.log("[UPDATE DRIVER] Driver updated:", driver._id);
    res.json({ success: true, driver });
  } catch (error) {
    console.error("[UPDATE DRIVER] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------- DELETE DRIVER ----------------
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    console.log("[DELETE DRIVER] driverId:", driverId);
    console.log("[DELETE DRIVER] req.shipper:", req.shipper);

    const driver = await Driver.findOneAndDelete({
      _id: driverId,
      shipper: req.shipper._id,
    });

    if (!driver) {
      console.log("[DELETE DRIVER] Driver not found");
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    console.log("[DELETE DRIVER] Driver deleted:", driver._id);
    res.json({ success: true, message: "Driver deleted successfully" });
  } catch (error) {
    console.error("[DELETE DRIVER] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// ACTIVATE / DEACTIVATE DRIVER (TOGGLE)
// ====================================================
exports.toggleDriverStatus = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // Toggle status
    driver.isActive = !driver.isActive;
    await driver.save();

    res.json({
      success: true,
      message: `Driver account ${
        driver.isActive ? "activated" : "deactivated"
      } successfully`,
      isActive: driver.isActive,
    });
  } catch (error) {
    console.error("[TOGGLE DRIVER STATUS]", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
