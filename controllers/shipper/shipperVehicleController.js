const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const cloudinary = require("../../config/cloudinary");

// ====================================================
// ADD VEHICLE
// ====================================================
exports.addVehicle = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const {
      transportType,
      vehicleName,
      vehicleType,
      numberOfStalls,
      stallSize,
      notes,
    } = req.body;

    if (!vehicleName || !vehicleType || !numberOfStalls || !stallSize) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields",
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

    const newVehicle = await ShipperVehicle.create({
      shipper: shipperId,
      transportType,
      vehicleName,
      vehicleType,
      numberOfStalls,
      stallSize,
      notes,
      images: imageArray,
    });

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

    // Update text fields
    const {
      transportType,
      vehicleName,
      vehicleType,
      numberOfStalls,
      stallSize,
      notes,
    } = req.body;

    if (transportType) vehicle.transportType = transportType;
    if (vehicleName) vehicle.vehicleName = vehicleName;
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (numberOfStalls) vehicle.numberOfStalls = numberOfStalls;
    if (stallSize) vehicle.stallSize = stallSize;
    if (notes) vehicle.notes = notes;

    // If new images are uploaded, upload to Cloudinary
    if (req.files && req.files.length > 0) {
      // Delete old images
      for (const img of vehicle.images) {
        await cloudinary.uploader.destroy(img.public_id);
      }

      // Upload new ones
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

    // Delete images from Cloudinary
    for (const img of vehicle.images) {
      await cloudinary.uploader.destroy(img.public_id);
    }

    await vehicle.deleteOne();

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
