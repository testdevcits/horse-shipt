const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");

const populateShipment = (query) =>
  query
    .populate("customer", "name email uniqueId phone")
    .populate("shipper", "name email uniqueId phone stripeVerified");

exports.getAllShipments = async (req, res) => {
  try {
    const { status, shipper, customer } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (shipper) filter.shipper = shipper;
    if (customer) filter.customer = customer;

    const shipments = await populateShipment(
      CustomerShipment.find(filter).sort({ createdAt: -1 })
    );

    res.status(200).json({
      success: true,
      count: shipments.length,
      data: shipments,
    });
  } catch (error) {
    console.error("Error fetching shipments:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await populateShipment(CustomerShipment.findById(id));

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    const quotes = await ShipmentQuote.find({ shipment: id })
      .populate("shipper", "name email uniqueId phone")
      .populate("vehicle", "name make model licensePlate")
      .populate("assignedDriver", "name email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        shipment,
        quotes,
      },
    });
  } catch (error) {
    console.error("Error fetching shipment:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
