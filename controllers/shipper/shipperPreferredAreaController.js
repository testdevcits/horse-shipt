const axios = require("axios");
const ShipperPreferredArea = require("../../models/shipper/shipperPreferredAreaModel");

// ===================================================
// Helper Function: Get Coordinates from Address
// ===================================================
const getCoordinatesFromAddress = async (address) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

    const response = await axios.get(url);
    const result = response.data.results[0];

    if (!result) return null;

    const { lat, lng } = result.geometry.location;
    return { latitude: lat, longitude: lng };
  } catch (error) {
    console.error("Google Geocoding API Error:", error);
    return null;
  }
};

// ===================================================
// Add a New Preferred Area (with auto geocoding)
// ===================================================
exports.addPreferredArea = async (req, res) => {
  try {
    const { address, radiusMiles } = req.body;

    if (!address || !radiusMiles) {
      return res.status(400).json({
        success: false,
        message: "Address and radiusMiles are required",
      });
    }

    // Auto-fetch coordinates from Google Maps API
    const coordinates = await getCoordinatesFromAddress(address);
    if (!coordinates) {
      return res.status(400).json({
        success: false,
        message: "Unable to fetch location coordinates for this address",
      });
    }

    const newArea = await ShipperPreferredArea.create({
      shipper: req.user.id,
      address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radiusMiles,
    });

    res.status(201).json({
      success: true,
      message: "Preferred area added successfully",
      data: newArea,
    });
  } catch (error) {
    console.error("Add Preferred Area Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add preferred area",
    });
  }
};

// ===================================================
// Update Preferred Area (auto geocode if address changed)
// ===================================================
exports.updatePreferredArea = async (req, res) => {
  try {
    const { areaId } = req.params;
    const { address, radiusMiles } = req.body;

    const area = await ShipperPreferredArea.findOne({
      _id: areaId,
      shipper: req.user.id,
    });

    if (!area) {
      return res.status(404).json({
        success: false,
        message: "Preferred area not found or unauthorized",
      });
    }

    // If address is changed, update coordinates
    if (address && address !== area.address) {
      const coordinates = await getCoordinatesFromAddress(address);
      if (!coordinates) {
        return res.status(400).json({
          success: false,
          message: "Unable to fetch location coordinates for this address",
        });
      }

      area.address = address;
      area.latitude = coordinates.latitude;
      area.longitude = coordinates.longitude;
    }

    if (radiusMiles) area.radiusMiles = radiusMiles;

    await area.save();

    res.status(200).json({
      success: true,
      message: "Preferred area updated successfully",
      data: area,
    });
  } catch (error) {
    console.error("Update Preferred Area Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update preferred area",
    });
  }
};

// ===================================================
// Get All Preferred Areas for Logged-in Shipper
// ===================================================
exports.getPreferredAreas = async (req, res) => {
  try {
    const areas = await ShipperPreferredArea.find({
      shipper: req.user.id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Preferred areas fetched successfully",
      data: areas,
    });
  } catch (error) {
    console.error("Get Preferred Areas Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch preferred areas",
    });
  }
};

// ===================================================
//  Delete Preferred Area
// ===================================================
exports.deletePreferredArea = async (req, res) => {
  try {
    const { areaId } = req.params;

    const area = await ShipperPreferredArea.findOneAndDelete({
      _id: areaId,
      shipper: req.user.id,
    });

    if (!area) {
      return res.status(404).json({
        success: false,
        message: "Preferred area not found or unauthorized",
      });
    }

    res.status(200).json({
      success: true,
      message: "Preferred area deleted successfully",
    });
  } catch (error) {
    console.error("Delete Preferred Area Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete preferred area",
    });
  }
};
