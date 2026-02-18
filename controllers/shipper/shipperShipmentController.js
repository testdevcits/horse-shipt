const mongoose = require("mongoose");
const ShipperShipment = require("../../models/shipper/ShipperShipment");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const shipperMailSend = require("../../utils/shipperMailSend");
const shipperSmsSend = require("../../utils/shipperSmsSend");

/* =========================================================
   GET ALL ASSIGNED SHIPMENTS (FOR SHIPPER DASHBOARD)
========================================================= */
exports.getAssignedShipments = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const shipments = await ShipperShipment.find({ shipper: shipperId })
      .populate({
        path: "shipment",
        populate: { path: "customer", select: "name email phone" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[GET ASSIGNED SHIPMENTS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* =========================================================
   GET SINGLE ASSIGNED SHIPMENT BY ID
========================================================= */
exports.getShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer",
      "name email phone"
    );

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    res.status(200).json({ success: true, shipment });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid shipment ID",
    });
  }
};

/* =========================================================
   GET AVAILABLE SHIPMENTS (MARKETPLACE)
========================================================= */
exports.getAvailableShipments = async (req, res) => {
  try {
    console.log("Fetching all available shipments for shippers...");

    // Get all shipment IDs already assigned
    const assignedShipments = await ShipperShipment.find({}, "shipment");
    const assignedIds = assignedShipments.map((s) => s.shipment);

    // Fetch shipments not assigned
    const shipments = await CustomerShipment.find({
      publish: true,
      status: { $in: ["pending", "open_for_offers"] },
      _id: { $nin: assignedIds },
    })
      .populate("customer", "name email phone")
      .select(
        `
        shipmentCode
        pickupLocation
        pickupDate
        deliveryLocation
        deliveryDate
        horses
        numberOfHorses
        additionalInfo
        publishedAt
        status
        `
      )
      .sort({ publishedAt: -1 }); // latest published first

    res.status(200).json({
      success: true,
      shipments,
    });
  } catch (err) {
    console.error("[GET AVAILABLE SHIPMENTS] Error:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/* =========================================================
   ACCEPT SHIPMENT
========================================================= */
exports.acceptShipment = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid shipment ID" });
    }

    const customerShipment = await CustomerShipment.findById(shipmentId);
    if (!customerShipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (customerShipment.status !== "open_for_offers") {
      return res.status(400).json({
        success: false,
        message: "Shipment is not available for offers",
      });
    }

    const existing = await ShipperShipment.findOne({ shipment: shipmentId });
    if (existing)
      return res.status(400).json({
        success: false,
        message: "Shipment already accepted by another shipper",
      });

    const shipperShipment = await ShipperShipment.create({
      shipper: shipperId,
      shipment: shipmentId,
      status: "assigned",
    });

    customerShipment.status = "assigned";
    customerShipment.shipper = shipperId;
    await customerShipment.save();

    const settings = await ShipperSettings.findOne({ shipperId });
    if (settings?.notifications?.shipment) {
      const msg = `New shipment assigned.\nPickup: ${customerShipment.pickupLocation}\nDelivery: ${customerShipment.deliveryLocation}`;
      if (settings.notifications.shipment.email)
        await shipperMailSend(shipperId, "Shipment Assigned", msg);
      if (settings.notifications.shipment.sms)
        await shipperSmsSend(shipperId, msg);
    }

    res.status(200).json({
      success: true,
      message: "Shipment accepted successfully",
      shipperShipment,
    });
  } catch (err) {
    console.error("[ACCEPT SHIPMENT] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* =========================================================
   UPDATE SHIPMENT STATUS
========================================================= */
exports.updateShipmentStatus = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid shipment ID" });
    }

    const shipperShipment = await ShipperShipment.findOne({
      _id: shipmentId,
      shipper: shipperId,
    });
    if (!shipperShipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    shipperShipment.status = status;
    await shipperShipment.save();

    const customerShipment = await CustomerShipment.findById(
      shipperShipment.shipment
    );
    if (customerShipment) {
      customerShipment.status = status;
      await customerShipment.save();
    }

    res.status(200).json({ success: true, shipment: shipperShipment });
  } catch (err) {
    console.error("[UPDATE SHIPMENT STATUS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// controllers/shipper/shipperShipmentController.js

exports.getAvailableShipmentsForMap = async (req, res) => {
  console.log("[SHIPPER MAP] req.params:", req.params);
  console.log("[SHIPPER MAP] req.query:", req.query);
  console.log("[SHIPPER MAP] req.user:", req.user?.id);

  try {
    console.log("[SHIPPER MAP] Fetching shipments for map");

    const assignedShipments = await ShipperShipment.find({}, "shipment");
    const assignedIds = assignedShipments.map((s) => s.shipment);

    const shipments = await CustomerShipment.find({
      publish: true,
      status: { $in: ["pending", "open_for_offers"] },
      _id: { $nin: assignedIds },
    })
      .select(
        `
        shipmentCode
        pickupLocation
        pickupCoords
        deliveryLocation
        deliveryCoords
        status
      `
      )
      .sort({ publishedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      shipments,
    });
  } catch (error) {
    console.error("[GET SHIPPER MAP SHIPMENTS ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
