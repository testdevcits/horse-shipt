const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const { sendShipperEmail } = require("../../utils/shipperMailSend");
const { sendShipperSms } = require("../../utils/shipperSmsSend");
const cloudinary = require("../../config/cloudinary");

// ====================================================
// ADD VEHICLE
// ====================================================
exports.addVehicle = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { vehicleType, trailerType, numberOfStalls, stallSize, notes } =
      req.body;

    // Validation
    if (!vehicleType || !numberOfStalls || !stallSize) {
      return res.status(400).json({
        success: false,
        message:
          "Please fill all required fields (vehicleType, numberOfStalls, stallSize)",
      });
    }

    // Upload images to Cloudinary
    let imageArray = [];
    if (req.files && req.files.length > 0) {
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

    // Create vehicle
    const newVehicle = await ShipperVehicle.create({
      shipper: shipperId,
      transportType: "Trucking",
      vehicleType,
      trailerType,
      numberOfStalls,
      stallSize,
      notes,
      images: imageArray,
    });

    // -----------------------------------------------
    // Check Notification Settings & Send Alerts
    // -----------------------------------------------
    const settings = await ShipperSettings.findOne({ shipperId });
    const notif = settings?.notifications?.shipment;

    if (notif) {
      if (notif.email) {
        await sendShipperEmail(
          shipperId,
          "New Vehicle Added",
          `Your vehicle (${newVehicle.vehicleType}) has been added successfully.`
        );
      }

      if (notif.sms) {
        await sendShipperSms(
          shipperId,
          `Your vehicle (${newVehicle.vehicleType}) has been added successfully.`
        );
      }
    }

    res.status(201).json({
      success: true,
      message: "Vehicle added successfully",
      vehicle: newVehicle,
    });
  } catch (error) {
    console.error("Add Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add vehicle",
      error: error.message,
    });
  }
};

// ====================================================
// GET ALL VEHICLES (SHIPPER)
// ====================================================
exports.getMyVehicles = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const vehicles = await ShipperVehicle.find({ shipper: shipperId }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      message: "Fetched all your vehicles successfully",
      vehicles,
    });
  } catch (error) {
    console.error("Get My Vehicles Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vehicles",
      error: error.message,
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
        message: "Vehicle not found or unauthorized",
      });
    }

    const { vehicleType, trailerType, numberOfStalls, stallSize, notes } =
      req.body;

    // Update fields
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (trailerType) vehicle.trailerType = trailerType;
    if (numberOfStalls) vehicle.numberOfStalls = numberOfStalls;
    if (stallSize) vehicle.stallSize = stallSize;
    if (notes) vehicle.notes = notes;

    // Replace images if new ones uploaded
    if (req.files && req.files.length > 0) {
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

    await vehicle.save();

    // Notify on update
    const settings = await ShipperSettings.findOne({ shipperId });
    const notif = settings?.notifications?.shipment;

    if (notif) {
      if (notif.email) {
        await sendShipperEmail(
          shipperId,
          "Vehicle Updated",
          `Your vehicle (${vehicle.vehicleType}) has been updated successfully.`
        );
      }

      if (notif.sms) {
        await sendShipperSms(
          shipperId,
          `Your vehicle (${vehicle.vehicleType}) has been updated successfully.`
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Vehicle updated successfully",
      vehicle,
    });
  } catch (error) {
    console.error("Update Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update vehicle",
      error: error.message,
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
        message: "Vehicle not found or unauthorized",
      });
    }

    // Delete old images from Cloudinary
    for (const img of vehicle.images) {
      await cloudinary.uploader.destroy(img.public_id);
    }

    await vehicle.deleteOne();

    // Notify on delete
    const settings = await ShipperSettings.findOne({ shipperId });
    const notif = settings?.notifications?.shipment;

    if (notif) {
      if (notif.email) {
        await sendShipperEmail(
          shipperId,
          "Vehicle Deleted",
          `Your vehicle (${vehicle.vehicleType}) has been deleted successfully.`
        );
      }

      if (notif.sms) {
        await sendShipperSms(
          shipperId,
          `Your vehicle (${vehicle.vehicleType}) has been deleted successfully.`
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Vehicle deleted successfully",
    });
  } catch (error) {
    console.error("Delete Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete vehicle",
      error: error.message,
    });
  }
};
