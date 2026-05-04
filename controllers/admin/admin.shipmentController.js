const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const ShipmentMessage = require("../../models/ShipmentMessage");
const { buildPagination, sendPaginated } = require("../../utils/adminQuery");

const populateShipment = (query) =>
  query
    .populate("customer", "name email uniqueId phone")
    .populate("shipper", "name email uniqueId phone stripeVerified");

exports.getAllShipments = async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const { status, shipper, customer, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (shipper) filter.shipper = shipper;
    if (customer) filter.customer = customer;
    if (search) {
      filter.$or = [
        { shipmentCode: { $regex: search, $options: "i" } },
        { pickupLocation: { $regex: search, $options: "i" } },
        { deliveryLocation: { $regex: search, $options: "i" } },
      ];
    }

    const [shipments, total] = await Promise.all([
      populateShipment(
        CustomerShipment.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
      ),
      CustomerShipment.countDocuments(filter),
    ]);

    return sendPaginated(res, { data: shipments, total, page, limit });
  } catch (error) {
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

    const [quotes, messages] = await Promise.all([
      ShipmentQuote.find({ shipment: id })
      .populate("shipper", "name email uniqueId phone")
        .populate("vehicle", "vehicleType vehicleNumber manufacturer model")
      .populate("assignedDriver", "name email phone")
        .sort({ createdAt: -1 }),
      ShipmentMessage.find({ shipment: id })
        .populate("customer", "name email uniqueId")
        .populate("shipper", "name email uniqueId")
        .sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        shipment,
        quotes,
        messages,
        tracking: {
          currentLocation: shipment.currentLocation,
          locationHistory: shipment.locationHistory || [],
          quoteTracking: quotes.map((quote) => ({
            quoteId: quote._id,
            shipper: quote.shipper,
            assignedDriver: quote.assignedDriver,
            tripStatus: quote.tripStatus,
            isTrackingActive: quote.isTrackingActive,
            currentLocation: quote.currentLocation,
            tripStartedAt: quote.tripStartedAt,
            deliveredAt: quote.deliveredAt,
          })),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getShipmentTracking = async (req, res) => {
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
      .populate("assignedDriver", "name email phone currentLocation driverStatus")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        shipment: {
          _id: shipment._id,
          shipmentCode: shipment.shipmentCode,
          status: shipment.status,
          customer: shipment.customer,
          shipper: shipment.shipper,
          pickupLocation: shipment.pickupLocation,
          deliveryLocation: shipment.deliveryLocation,
          currentLocation: shipment.currentLocation,
          locationHistory: shipment.locationHistory || [],
          deliveredAt: shipment.deliveredAt,
        },
        quotes: quotes.map((quote) => ({
          _id: quote._id,
          shipper: quote.shipper,
          assignedDriver: quote.assignedDriver,
          tripStatus: quote.tripStatus,
          isTrackingActive: quote.isTrackingActive,
          currentLocation: quote.currentLocation,
          tripStartedAt: quote.tripStartedAt,
          deliveredAt: quote.deliveredAt,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
