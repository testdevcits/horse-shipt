const Shipper = require("../../models/shipper/shipperModel");

// ===================================================
// ✅ Get Shipper Current Location
// ===================================================
exports.getCurrentLocation = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id).select(
      "currentLocation"
    );

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    if (
      !shipper.currentLocation ||
      !shipper.currentLocation.latitude ||
      !shipper.currentLocation.longitude
    ) {
      return res.status(200).json({
        success: true,
        message: "No location data available yet",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Current location fetched successfully",
      data: shipper.currentLocation,
    });
  } catch (error) {
    console.error("Get Shipper Location Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch current location",
    });
  }
};

// ===================================================
// ✅ Add or Update Shipper Current Location
// ===================================================
exports.updateCurrentLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const shipper = await Shipper.findByIdAndUpdate(
      req.user.id,
      {
        currentLocation: {
          latitude,
          longitude,
          updatedAt: new Date(),
        },
      },
      { new: true, select: "currentLocation" }
    );

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Current location updated successfully",
      data: shipper.currentLocation,
    });
  } catch (error) {
    console.error("Update Shipper Location Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update location",
    });
  }
};
