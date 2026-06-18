const { apiResponse } = require("../../responses/api.response");
const Shipper = require("../../models/shipper/shipperModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");

// ---------------- Update Shipper Profile ----------------
const fs = require("fs");
const path = require("path");

exports.updateProfile = async (req, res) => {
  try {
    const user = req.user;

    let { firstName, lastName, mobile, description, locale } = req.body;

    // MOBILE NORMALIZATION (GLOBAL)
    // -------------------------
    if (mobile) {

      mobile = mobile.toString().trim();

      // Ensure it starts with +
      if (!mobile.startsWith("+")) {
        return res.status(400).json({
          success: false,
          message: apiResponse.MOBILE_MUST_INCLUDE_COUNTRY_CODE_E_G_1_91,
        });
      }

      // Basic international validation (E.164 format)
      const mobileRegex = /^\+[1-9]\d{7,14}$/;

      if (!mobileRegex.test(mobile)) {
        return res.status(400).json({
          success: false,
          message: apiResponse.INVALID_MOBILE_NUMBER,
        });
      }

      user.mobile = mobile; // store full number with country code
    }

    // -------------------------
    // NAME VALIDATION
    // -------------------------
    if (firstName && firstName.length < 2) {
      return res.status(400).json({
        success: false,
        message: apiResponse.FIRST_NAME_MUST_BE_AT_LEAST_2_CHARACTERS,
      });
    }

    if (lastName && lastName.length < 2) {
      return res.status(400).json({
        success: false,
        message: apiResponse.LAST_NAME_MUST_BE_AT_LEAST_2_CHARACTERS,
      });
    }

    // -------------------------
    // NAME UPDATE
    // -------------------------
    if (firstName || lastName) {
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }

    // -------------------------
    // DESCRIPTION
    // -------------------------
    if (description !== undefined) {
      user.description = description.trim();
    }

    // -------------------------
    // LOCATION
    // -------------------------
    if (locale) {
      user.locale = {
        address: locale.address || user.locale?.address || "",
        latitude:
          typeof locale.latitude === "number"
            ? locale.latitude
            : user.locale?.latitude || null,
        longitude:
          typeof locale.longitude === "number"
            ? locale.longitude
            : user.locale?.longitude || null,
      };
    }

    // -------------------------
    // PROFILE IMAGE
    // -------------------------
    if (req.file) {

      if (user.profilePicture) {
        const oldPath = path.join(__dirname, "../../", user.profilePicture);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      user.profilePicture = `uploads/profilePictures/${req.file.filename}`;
    }

    // -------------------------
    // SAVE
    // -------------------------
    await user.save();

    return res.status(200).json({
      success: true,
      data: user,
      message: apiResponse.SHIPPER_PROFILE_UPDATED_SUCCESSFULLY,
    });
  } catch (err) {
    console.error("[SHIPPER PROFILE UPDATE ERROR]:", err);

    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_2,
    });
  }
};

// ---------------- Get Shipments Assigned to Shipper ----------------
exports.getAssignedShipments = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const shipments = await CustomerShipment.find({ shipper: shipperId }).sort({
      createdAt: -1,
    });
    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[GET ASSIGNED SHIPMENTS] Error:", err);
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ---------------- Get Shipment by ID ----------------
exports.getShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPMENT_NOT_FOUND });

    if (
      !shipment.shipper ||
      shipment.shipper.toString() !== req.user._id.toString()
    )
      return res
        .status(403)
        .json({ success: false, message: apiResponse.UNAUTHORIZED_ACCESS });

    res.status(200).json({ success: true, shipment });
  } catch (err) {
    console.error("[GET SHIPMENT BY ID] Error:", err);
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ---------------- Update Shipment Status ----------------
exports.updateShipmentStatus = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { status } = req.body; // e.g., pending, picked-up, delivered

    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPMENT_NOT_FOUND });

    if (
      !shipment.shipper ||
      shipment.shipper.toString() !== req.user._id.toString()
    )
      return res
        .status(403)
        .json({ success: false, message: apiResponse.UNAUTHORIZED_ACCESS });

    shipment.status = status;
    await shipment.save();

    res.status(200).json({ success: true, shipment });
  } catch (err) {
    console.error("[UPDATE SHIPMENT STATUS] Error:", err);
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ---------------- Update Shipment Live Location ----------------
exports.updateShipmentLocationByShipper = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { latitude, longitude } = req.body;

    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPMENT_NOT_FOUND });

    if (
      !shipment.shipper ||
      shipment.shipper.toString() !== req.user._id.toString()
    )
      return res
        .status(403)
        .json({ success: false, message: apiResponse.UNAUTHORIZED_ACCESS });

    const newLocation = { latitude, longitude, updatedAt: new Date() };
    shipment.currentLocation = newLocation;
    shipment.locationHistory.push(newLocation);

    await shipment.save();
    res
      .status(200)
      .json({ success: true, currentLocation: shipment.currentLocation });
  } catch (err) {
    console.error("[UPDATE SHIPMENT LOCATION] Error:", err);
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};
