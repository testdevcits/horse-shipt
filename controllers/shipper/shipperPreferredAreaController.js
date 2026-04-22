const PreferredArea = require("../../models/shipper/shipperPreferredAreaModel");

// ================================
// COMMON RESPONSE HELPERS
// ================================
const successResponse = (res, message, data = null, status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (res, message, status = 500) => {
  return res.status(status).json({
    success: false,
    message,
  });
};

// ================================
// ADD PREFERRED AREA (MAX 4)
// ================================
exports.addPreferredArea = async (req, res) => {
  try {
    const { locationName, latitude, longitude, radiusKm } = req.body;

    // Validation
    if (!latitude || !longitude) {
      return errorResponse(res, "Latitude and Longitude are required", 400);
    }

    // Limit: max 4 areas per shipper
    const count = await PreferredArea.countDocuments({
      shipper: req.user.id,
    });

    if (count >= 4) {
      return errorResponse(
        res,
        "You can only add up to 4 preferred areas",
        400
      );
    }

    const newArea = await PreferredArea.create({
      shipper: req.user.id,
      locationName: locationName || "",
      coordinates: {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)], // ⚠️ [lng, lat]
      },
      radiusKm: radiusKm || 50,
    });

    return successResponse(
      res,
      "Preferred area added successfully",
      newArea,
      201
    );
  } catch (err) {
    return errorResponse(res, err.message);
  }
};

// ================================
// GET ALL AREAS
// ================================
exports.getPreferredAreas = async (req, res) => {
  try {
    const areas = await PreferredArea.find({
      shipper: req.user.id,
    }).sort({ createdAt: -1 });

    return successResponse(res, "Preferred areas fetched", areas);
  } catch (err) {
    return errorResponse(res, err.message);
  }
};

// ================================
// UPDATE AREA
// ================================
exports.updatePreferredArea = async (req, res) => {
  try {
    const { areaId } = req.params;
    const { locationName, latitude, longitude, radiusKm } = req.body;

    const area = await PreferredArea.findOne({
      _id: areaId,
      shipper: req.user.id,
    });

    if (!area) {
      return errorResponse(res, "Preferred area not found", 404);
    }

    // Update fields
    if (locationName !== undefined) {
      area.locationName = locationName;
    }

    if (latitude !== undefined && longitude !== undefined) {
      area.coordinates = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    if (radiusKm !== undefined) {
      area.radiusKm = radiusKm;
    }

    await area.save();

    return successResponse(res, "Preferred area updated successfully", area);
  } catch (err) {
    return errorResponse(res, err.message);
  }
};

// ================================
// DELETE AREA
// ================================
exports.deletePreferredArea = async (req, res) => {
  try {
    const { areaId } = req.params;

    const deleted = await PreferredArea.findOneAndDelete({
      _id: areaId,
      shipper: req.user.id,
    });

    if (!deleted) {
      return errorResponse(res, "Preferred area not found", 404);
    }

    return successResponse(res, "Preferred area deleted successfully");
  } catch (err) {
    return errorResponse(res, err.message);
  }
};

// ================================
// GET SINGLE AREA (OPTIONAL)
// ================================
exports.getPreferredAreaById = async (req, res) => {
  try {
    const { areaId } = req.params;

    const area = await PreferredArea.findOne({
      _id: areaId,
      shipper: req.user.id,
    });

    if (!area) {
      return errorResponse(res, "Preferred area not found", 404);
    }

    return successResponse(res, "Preferred area fetched", area);
  } catch (err) {
    return errorResponse(res, err.message);
  }
};
