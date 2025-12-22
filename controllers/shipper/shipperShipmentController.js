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
        populate: { path: "customer", select: "name email" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      shipments,
    });
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
    const shipperId = req.user._id;
    const { shipmentId } = req.params;

    // Prevent CastError
    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shipment ID",
      });
    }

    const shipperShipment = await ShipperShipment.findOne({
      _id: shipmentId,
      shipper: shipperId,
    }).populate({
      path: "shipment",
      populate: { path: "customer", select: "name email" },
    });

    if (!shipperShipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found or not assigned",
      });
    }

    res.status(200).json({
      success: true,
      shipment: shipperShipment,
    });
  } catch (err) {
    console.error("[GET SHIPMENT BY ID] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* =========================================================
   GET AVAILABLE SHIPMENTS (MARKETPLACE)
========================================================= */
exports.getAvailableShipments = async (req, res) => {
  try {
    const shipments = await CustomerShipment.find({
      publish: true,
      status: "open_for_offers",
      shipper: null, // Not assigned to any shipper yet
    })
      .populate("customer", "name email")
      .sort({ pickupDate: 1 });

    res.status(200).json({
      success: true,
      shipments,
    });
  } catch (err) {
    console.error("[GET AVAILABLE SHIPMENTS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
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
      return res.status(400).json({
        success: false,
        message: "Invalid shipment ID",
      });
    }

    const customerShipment = await CustomerShipment.findById(shipmentId);
    if (!customerShipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ✅ FIXED STATUS CHECK
    if (customerShipment.status !== "open_for_offers") {
      return res.status(400).json({
        success: false,
        message: "Shipment is not available for offers",
      });
    }

    // Already accepted?
    const existing = await ShipperShipment.findOne({ shipment: shipmentId });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Shipment already accepted by another shipper",
      });
    }

    // Create shipper shipment
    const shipperShipment = await ShipperShipment.create({
      shipper: shipperId,
      shipment: shipmentId,
      status: "assigned",
    });

    // Update customer shipment
    customerShipment.status = "assigned";
    customerShipment.shipper = shipperId;
    await customerShipment.save();

    /* -------- Notifications -------- */
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
      return res.status(400).json({
        success: false,
        message: "Invalid shipment ID",
      });
    }

    const shipperShipment = await ShipperShipment.findOne({
      _id: shipmentId,
      shipper: shipperId,
    });

    if (!shipperShipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

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
