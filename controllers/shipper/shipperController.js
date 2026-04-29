const Shipper = require("../../models/shipper/shipperModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");

// ---------------- Update Shipper Profile ----------------
const fs = require("fs");
const path = require("path");

exports.updateProfile = async (req, res) => {
  try {
    const user = req.user;

    let { firstName, lastName, mobile, description, locale } = req.body;

    console.log("=====================================");
    console.log("[UPDATE PROFILE] Start", { userId: user._id, mobile });

    // MOBILE NORMALIZATION (GLOBAL)
    // -------------------------
    if (mobile) {
      console.log("[MOBILE RAW INPUT]", mobile);

      mobile = mobile.toString().trim();

      // Ensure it starts with +
      if (!mobile.startsWith("+")) {
        return res.status(400).json({
          success: false,
          message: "Mobile must include country code (e.g. +1, +91)",
        });
      }

      // Basic international validation (E.164 format)
      const mobileRegex = /^\+[1-9]\d{7,14}$/;

      if (!mobileRegex.test(mobile)) {
        console.log("[ERROR] Invalid international mobile");
        return res.status(400).json({
          success: false,
          message: "Invalid mobile number",
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
        message: "First name must be at least 2 characters",
      });
    }

    if (lastName && lastName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Last name must be at least 2 characters",
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
      console.log("[PROFILE IMAGE UPDATE]");

      if (user.profilePicture) {
        const oldPath = path.join(__dirname, "../../", user.profilePicture);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          console.log("[OLD IMAGE REMOVED]");
        }
      }

      user.profilePicture = `uploads/profilePictures/${req.file.filename}`;
    }

    // -------------------------
    // SAVE
    // -------------------------
    await user.save();

    console.log("[PROFILE UPDATED SUCCESSFULLY]");
    console.log("=====================================");

    return res.status(200).json({
      success: true,
      data: user,
      message: "Shipper profile updated successfully",
    });
  } catch (err) {
    console.error("[SHIPPER PROFILE UPDATE ERROR]:", err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
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
    res.status(500).json({ success: false, message: "Server Error" });
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
        .json({ success: false, message: "Shipment not found" });

    if (
      !shipment.shipper ||
      shipment.shipper.toString() !== req.user._id.toString()
    )
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });

    res.status(200).json({ success: true, shipment });
  } catch (err) {
    console.error("[GET SHIPMENT BY ID] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
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
        .json({ success: false, message: "Shipment not found" });

    if (
      !shipment.shipper ||
      shipment.shipper.toString() !== req.user._id.toString()
    )
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });

    shipment.status = status;
    await shipment.save();

    res.status(200).json({ success: true, shipment });
  } catch (err) {
    console.error("[UPDATE SHIPMENT STATUS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
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
        .json({ success: false, message: "Shipment not found" });

    if (
      !shipment.shipper ||
      shipment.shipper.toString() !== req.user._id.toString()
    )
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });

    const newLocation = { latitude, longitude, updatedAt: new Date() };
    shipment.currentLocation = newLocation;
    shipment.locationHistory.push(newLocation);

    await shipment.save();
    res
      .status(200)
      .json({ success: true, currentLocation: shipment.currentLocation });
  } catch (err) {
    console.error("[UPDATE SHIPMENT LOCATION] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
