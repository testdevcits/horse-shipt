const Driver = require("../../models/shipper/Driver");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const bcrypt = require("bcryptjs");
const cloudinary = require("../../utils/cloudinary");

// ====================================================
// ADD DRIVER
// ====================================================
exports.addDriver = async (req, res) => {
  try {
    const { name, email, password, phone, licenseNumber, notes } = req.body;

    // Check if driver already exists
    const existingDriver = await Driver.findOne({ email });
    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: "Driver with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const driver = new Driver({
      name,
      email,
      password: hashedPassword,
      phone,
      licenseNumber,
      notes,
      shipper: req.shipper._id,
    });

    await driver.save();
    res.status(201).json({ success: true, driver });
  } catch (error) {
    console.error("[ADD DRIVER] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// GET MY DRIVERS
// ====================================================
exports.getMyDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ shipper: req.shipper._id }).populate(
      "assignedVehicles"
    );
    res.json({ success: true, drivers });
  } catch (error) {
    console.error("[GET DRIVERS] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// ASSIGN VEHICLES TO DRIVER
// ====================================================
exports.assignVehiclesToDriver = async (req, res) => {
  try {
    const { driverId } = req.body;
    let { vehicleIds } = req.body;

    const driver = await Driver.findOne({
      _id: driverId,
      shipper: req.shipper._id,
    });

    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Fix nested object issue
    if (vehicleIds?.vehicleIds) {
      vehicleIds = vehicleIds.vehicleIds;
    }

    // Ensure array
    if (!Array.isArray(vehicleIds)) {
      vehicleIds = [vehicleIds];
    }

    vehicleIds.forEach((vid) => {
      if (!driver.assignedVehicles.includes(vid)) {
        driver.assignedVehicles.push(vid);
      }
    });

    await driver.save();

    const populatedDriver = await driver.populate("assignedVehicles");

    res.json({
      success: true,
      driver: populatedDriver,
    });
  } catch (error) {
    console.error("[ASSIGN VEHICLES] Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ====================================================
// UPDATE DRIVER
// ====================================================
exports.updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const updates = { ...req.body };

    // Hash password only if it exists
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    } else {
      delete updates.password;
    }

    const driver = await Driver.findOneAndUpdate(
      { _id: driverId, shipper: req.shipper._id },
      updates,
      { new: true }
    );

    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    res.json({ success: true, driver });
  } catch (error) {
    console.error("[UPDATE DRIVER] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DELETE DRIVER
// ====================================================
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findOneAndDelete({
      _id: driverId,
      shipper: req.shipper._id,
    });

    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    res.json({ success: true, message: "Driver deleted successfully" });
  } catch (error) {
    console.error("[DELETE DRIVER] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// TOGGLE DRIVER STATUS
// ====================================================
exports.toggleDriverStatus = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId);
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

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
    console.error("[TOGGLE DRIVER STATUS] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// UPDATE DRIVER PROFILE IMAGE
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
    console.error("[DRIVER IMAGE UPDATE] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DELETE DRIVER PROFILE IMAGE
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
    console.error("[DRIVER IMAGE DELETE] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateDriverLocation = async (req, res) => {
  try {
    const driverId = req.user._id;
    const { lat, lng, speed, heading } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude required",
      });
    }

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      {
        currentLocation: {
          lat,
          lng,
          coordinates: {
            type: "Point",
            coordinates: [lng, lat],
          },
          speed: speed || 0,
          heading: heading || 0,
          updatedAt: new Date(),
        },
        lastActiveAt: new Date(),
      },
      { new: true }
    );

    res.json({
      success: true,
      message: "Location updated",
      location: driver.currentLocation,
    });
  } catch (error) {
    console.error("[LOCATION UPDATE ERROR]", error);
    res.status(500).json({
      success: false,
      message: "Failed to update location",
    });
  }
};
