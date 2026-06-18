const { apiResponse } = require("../../responses/api.response");
const axios = require("axios");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const Driver = require("../../models/shipper/Driver");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");

const { VEHICLE_MESSAGES } = require("../../utils/response/vehicleMessages");

const { sendShipperEmail } = require("../../utils/shipperMailSend");
const { sendShipperSms } = require("../../utils/shipperSmsSend");

const cloudinary = require("../../config/cloudinary");

// ====================================================
// ADD VEHICLE
// ====================================================
exports.addVehicle = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const {
      vehicleType,
      vehicleNumber,
      trailerType,
      numberOfStalls,
      stallSize,
      notes,
      vinNumber,
    } = req.body;

    if (!vehicleType || !vehicleNumber || !numberOfStalls || !stallSize) {
      return res.status(400).json({
        success: false,
        message: VEHICLE_MESSAGES.REQUIRED_FIELDS,
      });
    }

    const existingVehicle = await ShipperVehicle.findOne({
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
    });

    if (existingVehicle) {
      return res.status(409).json({
        success: false,
        message: VEHICLE_MESSAGES.VEHICLE_ALREADY_EXISTS,
      });
    }

    if (vinNumber) {
      const vinExists = await ShipperVehicle.findOne({
        vinNumber: vinNumber.trim().toUpperCase(),
      });

      if (vinExists) {
        return res.status(409).json({
          success: false,
          message: VEHICLE_MESSAGES.VIN_ALREADY_EXISTS,
        });
      }
    }

    // ===== Upload Images =====
    let imageArray = [];

    if (req.files?.length) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "shipper_vehicles",
        });

        imageArray.push({
          public_id: result.public_id,
          url: result.secure_url,
        });
      }
    }

    // ===== Create Vehicle First (PENDING Verification) =====
    const vehicle = await ShipperVehicle.create({
      shipper: shipperId,
      transportType: "Trucking",
      vehicleType,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      trailerType,
      numberOfStalls,
      stallSize,
      notes,
      vinNumber: vinNumber ? vinNumber.trim().toUpperCase() : null,
      verificationStatus: "PENDING",
      images: imageArray,
    });

    // ===== Async Verification Trigger =====
    if (vinNumber) {
      try {
        verifyVehicleAsync(vehicle._id, vinNumber);
      } catch (err) {
      }
    }

    res.status(201).json({
      success: true,
      message: VEHICLE_MESSAGES.VEHICLE_ADDED,
      vehicle,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: VEHICLE_MESSAGES.VEHICLE_CREATE_ERROR,
    });
  }
};

// ====================================================
// GET VEHICLES
// ====================================================
exports.getMyVehicles = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const vehicles = await ShipperVehicle.find({
      shipper: shipperId,
    })
      .populate("driver", "name email phone isActive")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: VEHICLE_MESSAGES.VEHICLE_FETCHED,
      vehicles,
    });
  } catch (error) {
    console.error("[GET VEHICLES ERROR]:", error);

    res.status(500).json({
      success: false,
      message: VEHICLE_MESSAGES.VEHICLE_FETCH_ERROR,
    });
  }
};

// ====================================================
// UPDATE VEHICLE
// ====================================================
exports.updateVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const shipperId = req.user._id;

    const vehicle = await ShipperVehicle.findOne({
      _id: vehicleId,
      shipper: shipperId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: VEHICLE_MESSAGES.VEHICLE_NOT_FOUND,
      });
    }

    const {
      vehicleType,
      vehicleNumber,
      trailerType,
      numberOfStalls,
      stallSize,
      notes,
      vinNumber,
    } = req.body;

    if (vehicleType) vehicle.vehicleType = vehicleType;

    if (vehicleNumber) {
      const exists = await ShipperVehicle.findOne({
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        _id: { $ne: vehicleId },
      });

      if (exists) {
        return res.status(409).json({
          success: false,
          message: VEHICLE_MESSAGES.VEHICLE_ALREADY_EXISTS,
        });
      }

      vehicle.vehicleNumber = vehicleNumber.trim().toUpperCase();
    }

    if (vinNumber !== undefined) {
      vehicle.vinNumber = vinNumber ? vinNumber.trim().toUpperCase() : null;
    }

    if (trailerType) vehicle.trailerType = trailerType;
    if (numberOfStalls) vehicle.numberOfStalls = numberOfStalls;
    if (stallSize) vehicle.stallSize = stallSize;
    if (notes) vehicle.notes = notes;

    if (req.files?.length) {
      for (const img of vehicle.images) {
        await cloudinary.uploader.destroy(img.public_id);
      }

      let newImages = [];

      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "shipper_vehicles",
        });

        newImages.push({
          public_id: result.public_id,
          url: result.secure_url,
        });
      }

      vehicle.images = newImages;
    }

    vehicle.verificationStatus = "PENDING";

    await vehicle.save();

    res.status(200).json({
      success: true,
      message: VEHICLE_MESSAGES.VEHICLE_UPDATED,
      vehicle,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: VEHICLE_MESSAGES.VEHICLE_UPDATE_ERROR,
    });
  }
};

// ====================================================
// DELETE VEHICLE
// ====================================================
exports.deleteVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const shipperId = req.user._id;

    const vehicle = await ShipperVehicle.findOne({
      _id: vehicleId,
      shipper: shipperId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: VEHICLE_MESSAGES.VEHICLE_NOT_FOUND,
      });
    }

    for (const img of vehicle.images) {
      await cloudinary.uploader.destroy(img.public_id);
    }

    await vehicle.deleteOne();

    res.status(200).json({
      success: true,
      message: VEHICLE_MESSAGES.VEHICLE_DELETED,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: VEHICLE_MESSAGES.VEHICLE_DELETE_ERROR,
    });
  }
};

exports.verifyVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;

    const vehicle = await ShipperVehicle.findById(vehicleId);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: apiResponse.VEHICLE_NOT_FOUND,
      });
    }

    if (!vehicle.vinNumber) {
      return res.status(400).json({
        success: false,
        message: apiResponse.VIN_NUMBER_MISSING,
      });
    }

    // External Verification Call
    const response = await axios.get(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vehicle.vinNumber}?format=json`
    );

    const data = response.data?.Results?.[0];

    if (!data) {
      return res.status(400).json({
        success: false,
        message: apiResponse.VERIFICATION_FAILED,
      });
    }

    // Update Database
    vehicle.vinMetaData = data;
    vehicle.manufacturer = data.Make || "";
    vehicle.model = data.Model || "";
    vehicle.modelYear = data.ModelYear || null;
    vehicle.bodyClass = data.BodyClass || "";

    vehicle.verificationStatus = "VERIFIED";

    await vehicle.save();

    res.json({
      success: true,
      message: apiResponse.VEHICLE_VERIFIED_SUCCESSFULLY,
      vehicle,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: apiResponse.VERIFICATION_ERROR,
    });
  }
};

// ====================================================
// ASSIGN DRIVER TO VEHICLE
// ====================================================
exports.assignDriverToVehicle = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { vehicleId, driverId } = req.body;

    // ================= VALIDATION =================
    if (!vehicleId || !driverId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.VEHICLE_ID_AND_DRIVER_ID_ARE_REQUIRED,
      });
    }

    // ================= FIND VEHICLE =================
    const vehicle = await ShipperVehicle.findOne({
      _id: vehicleId,
      shipper: shipperId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: apiResponse.VEHICLE_NOT_FOUND,
      });
    }

    // ================= FIND DRIVER =================
    const driver = await Driver.findOne({
      _id: driverId,
      shipper: shipperId,
      isActive: true,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: apiResponse.DRIVER_NOT_FOUND_OR_INACTIVE,
      });
    }

    // ================= DRIVER BUSY CHECK =================
    const activeDriverShipment = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      tripStatus: { $in: ["started", "inTransit"] },
    });

    if (activeDriverShipment) {
      return res.status(400).json({
        success: false,
        message: apiResponse.DRIVER_IS_ALREADY_BUSY_WITH_ANOTHER_SHIPMENT,
      });
    }

    // ================= VEHICLE BUSY CHECK =================
    const activeVehicleShipment = await ShipmentQuote.findOne({
      vehicle: vehicleId,
      tripStatus: { $in: ["started", "inTransit"] },
    });

    if (activeVehicleShipment) {
      return res.status(400).json({
        success: false,
        message: apiResponse.VEHICLE_ALREADY_IN_USE,
      });
    }

    // ================= ASSIGN DRIVER =================
    vehicle.driver = driverId;
    vehicle.driverStatus = "AVAILABLE";

    // ALSO UPDATE DRIVER SIDE (IMPORTANT)
    driver.assignedVehicles = [vehicleId];
    driver.driverStatus = "available";

    await vehicle.save();
    await driver.save();

    // ================= POPULATE DRIVER =================
    const updatedVehicle = await ShipperVehicle.findById(vehicle._id).populate(
      "driver",
      "name email phone"
    );

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      message: apiResponse.DRIVER_ASSIGNED_SUCCESSFULLY,

      vehicle: updatedVehicle,

      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
      },
    });
  } catch (err) {
    console.error("[ASSIGN DRIVER ERROR]:", err);

    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_ASSIGN_DRIVER,
      error: err.message,
    });
  }
};
