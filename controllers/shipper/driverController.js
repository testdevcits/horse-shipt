const Driver = require("../../models/shipper/Driver");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const cloudinary = require("../../utils/cloudinary");
const { buildPagination, sendPaginated } = require("../../utils/adminQuery");

const PASSWORD_MIN_LENGTH = 8;

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const publicDriver = (driver) => {
  const doc = driver?.toObject ? driver.toObject() : driver;
  if (!doc) return null;
  delete doc.password;
  return doc;
};

const validateDriverPayload = (
  payload = {},
  { requirePassword = false, requireFields = false } = {}
) => {
  const errors = {};
  const requiredFields = ["name", "email", "phone", "licenseNumber"];

  requiredFields.forEach((field) => {
    if (requireFields && !String(payload[field] || "").trim()) {
      errors[field] = `${field} is required`;
    }
  });

  const email = normalizeEmail(payload.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Valid email is required";
  }

  if (requirePassword || payload.password) {
    if (!String(payload.password || "").trim()) {
      errors.password = "Password is required";
    } else if (String(payload.password).length < PASSWORD_MIN_LENGTH) {
      errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    }
  }

  return errors;
};

// ====================================================
// ADD DRIVER
// ====================================================
exports.addDriver = async (req, res) => {
  try {
    const { name, password, phone, licenseNumber, notes } = req.body;
    const email = normalizeEmail(req.body.email);
    const errors = validateDriverPayload(
      { name, email, password, phone, licenseNumber },
      { requirePassword: true, requireFields: true }
    );

    if (Object.keys(errors).length) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver details",
        errors,
      });
    }

    // Check if driver already exists
    const existingDriver = await Driver.findOne({ email });
    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: "Driver with this email already exists",
      });
    }

    const driver = new Driver({
      name: String(name).trim(),
      email,
      password,
      phone: String(phone).trim(),
      licenseNumber: String(licenseNumber).trim(),
      notes: String(notes || "").trim(),
      shipper: req.shipper._id,
    });

    await driver.save();
    res.status(201).json({
      success: true,
      message: "Driver created successfully",
      data: publicDriver(driver),
      driver: publicDriver(driver),
    });
  } catch (error) {
    console.error("[ADD DRIVER] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create driver",
      errors: { server: error.message },
    });
  }
};

// ====================================================
// GET MY DRIVERS
// ====================================================
exports.getMyDrivers = async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const { search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    const filter = { shipper: req.shipper._id };

    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (search) {
      const term = String(search).trim();
      filter.$or = [
        { name: { $regex: term, $options: "i" } },
        { email: { $regex: term, $options: "i" } },
        { phone: { $regex: term, $options: "i" } },
        { licenseNumber: { $regex: term, $options: "i" } },
      ];
    }

    const allowedSortFields = ["createdAt", "name", "email", "driverStatus"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [drivers, total] = await Promise.all([
      Driver.find(filter)
        .select("-password")
        .populate("assignedVehicles")
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limit),
      Driver.countDocuments(filter),
    ]);

    return sendPaginated(res, { data: drivers, total, page, limit });
  } catch (error) {
    console.error("[GET DRIVERS] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch drivers",
      errors: { server: error.message },
    });
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
      message: "Vehicles assigned successfully",
      data: publicDriver(populatedDriver),
      driver: publicDriver(populatedDriver),
    });
  } catch (error) {
    console.error("[ASSIGN VEHICLES] Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to assign vehicles",
      errors: { server: error.message },
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
    const errors = validateDriverPayload(updates);

    if (Object.keys(errors).length) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver details",
        errors,
      });
    }

    const driver = await Driver.findOne({
      _id: driverId,
      shipper: req.shipper._id,
    });

    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    if (updates.email !== undefined) {
      const nextEmail = normalizeEmail(updates.email);
      const emailOwner = await Driver.findOne({
        email: nextEmail,
        _id: { $ne: driverId },
      }).select("_id");

      if (emailOwner) {
        return res.status(400).json({
          success: false,
          message: "Driver with this email already exists",
          errors: { email: "Driver with this email already exists" },
        });
      }
    }

    ["name", "phone", "licenseNumber", "notes"].forEach((field) => {
      if (updates[field] !== undefined) driver[field] = String(updates[field]).trim();
    });
    if (updates.email !== undefined) driver.email = normalizeEmail(updates.email);
    if (updates.password) driver.password = updates.password;

    await driver.save();
    await driver.populate("assignedVehicles");

    res.json({
      success: true,
      message: "Driver updated successfully",
      data: publicDriver(driver),
      driver: publicDriver(driver),
    });
  } catch (error) {
    console.error("[UPDATE DRIVER] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update driver",
      errors: { server: error.message },
    });
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

    const driver = await Driver.findOne({
      _id: driverId,
      shipper: req.shipper._id,
    });
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
