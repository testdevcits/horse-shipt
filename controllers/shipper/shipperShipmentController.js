const ShipperShipment = require("../../models/shipper/ShipperShipment");
const CustomerShipment = require("../../models/customer/CustomerShipment");

// ---------------- Get All Shipments Assigned to Shipper ----------------
exports.getAssignedShipments = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const shipments = await ShipperShipment.find({ shipper: shipperId })
      .populate("shipment")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[GET ASSIGNED SHIPMENTS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Shipment by ID ----------------
exports.getShipmentById = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;

    const shipperShipment = await ShipperShipment.findOne({
      _id: shipmentId,
      shipper: shipperId,
    }).populate("shipment");

    if (!shipperShipment)
      return res.status(404).json({
        success: false,
        message: "Shipment not found or not assigned",
      });

    res.status(200).json({ success: true, shipment: shipperShipment });
  } catch (err) {
    console.error("[GET SHIPMENT BY ID] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Available Shipments ----------------
exports.getAvailableShipments = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Only fetch pending shipments (created by customer) that are not yet assigned
    const shipments = await CustomerShipment.find({
      status: "pending",
      pickupDate: { $gte: today },
    }).sort({ pickupDate: 1 });

    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[GET AVAILABLE SHIPMENTS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Accept Shipment ----------------
exports.acceptShipment = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;

    const customerShipment = await CustomerShipment.findById(shipmentId);
    if (!customerShipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (customerShipment.status !== "pending")
      return res.status(400).json({
        success: false,
        message: "Shipment already assigned or completed",
      });

    // Check if this shipment is already assigned to any shipper
    const existingAssignment = await ShipperShipment.findOne({
      shipment: shipmentId,
    });
    if (existingAssignment)
      return res.status(400).json({
        success: false,
        message: "Shipment is already accepted by another shipper",
      });

    // Check if shipper already has shipment on same pickup date
    const conflictingShipment = await ShipperShipment.findOne({
      shipper: shipperId,
    }).populate("shipment");
    if (
      conflictingShipment &&
      conflictingShipment.shipment.pickupDate === customerShipment.pickupDate
    ) {
      return res.status(400).json({
        success: false,
        message: "You already have a shipment on this pickup date",
      });
    }

    // Assign shipment to shipper
    const shipperShipment = new ShipperShipment({
      shipper: shipperId,
      shipment: shipmentId,
      status: "assigned",
      currentLocation: null,
      locationHistory: [],
    });
    await shipperShipment.save();

    // Update customer shipment status
    customerShipment.status = "assigned";
    await customerShipment.save();

    res
      .status(200)
      .json({ success: true, message: "Shipment accepted", shipperShipment });
  } catch (err) {
    console.error("[ACCEPT SHIPMENT] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Update Shipment Status ----------------
exports.updateShipmentStatus = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;
    const { status } = req.body;

    const shipperShipment = await ShipperShipment.findOne({
      _id: shipmentId,
      shipper: shipperId,
    });

    if (!shipperShipment)
      return res.status(404).json({
        success: false,
        message: "Shipment not found or not assigned",
      });

    shipperShipment.status = status;
    await shipperShipment.save();

    // Update customer shipment accordingly
    const customerShipment = await CustomerShipment.findById(
      shipperShipment.shipment
    );
    if (customerShipment) {
      customerShipment.status = status === "picked_up" ? "in_transit" : status;
      await customerShipment.save();
    }

    res.status(200).json({ success: true, shipment: shipperShipment });
  } catch (err) {
    console.error("[UPDATE SHIPMENT STATUS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Update Shipment Live Location ----------------
exports.updateShipmentLocationByShipper = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;
    const { latitude, longitude } = req.body;

    const shipperShipment = await ShipperShipment.findOne({
      _id: shipmentId,
      shipper: shipperId,
    });

    if (!shipperShipment)
      return res.status(404).json({
        success: false,
        message: "Shipment not found or not assigned",
      });

    const newLocation = { latitude, longitude, updatedAt: new Date() };
    shipperShipment.currentLocation = newLocation;
    shipperShipment.locationHistory.push(newLocation);
    await shipperShipment.save();

    // Also update customer shipment location
    const customerShipment = await CustomerShipment.findById(
      shipperShipment.shipment
    );
    if (customerShipment) {
      customerShipment.currentLocation = newLocation;
      customerShipment.locationHistory.push(newLocation);
      await customerShipment.save();
    }

    res
      .status(200)
      .json({
        success: true,
        currentLocation: shipperShipment.currentLocation,
      });
  } catch (err) {
    console.error("[UPDATE SHIPMENT LOCATION] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
