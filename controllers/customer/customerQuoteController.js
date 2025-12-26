const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const Customer = require("../../models/customer/customerModel");

// ====================================================
// GET ALL QUOTES FOR A SHIPMENT (CUSTOMER)
// ====================================================
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    // Validate shipment exists and get customer info
    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customerId",
      "name email"
    );
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // Only the owner customer can view their shipment quotes
    if (shipment.customerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view quotes for this shipment",
      });
    }

    const quotes = await ShipmentQuote.find({ shipment: shipmentId })
      .populate("shipper", "name email phone companyName")
      .populate("vehicle") // if vehicle ID is stored in quote
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: `Found ${quotes.length} quote(s) for this shipment`,
      quotes,
    });
  } catch (err) {
    console.error("[GET QUOTES BY SHIPMENT ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotes for this shipment",
      error: err.message,
    });
  }
};

// ====================================================
// GET SINGLE QUOTE BY ID (CUSTOMER)
// ====================================================
exports.getQuoteById = async (req, res) => {
  try {
    const { quoteId } = req.params;

    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .populate({
        path: "shipment",
        select: "customerId",
        populate: { path: "customerId", select: "name email" },
      });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // Only the shipment owner can view this quote
    if (quote.shipment.customerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this quote",
      });
    }

    res.status(200).json({
      success: true,
      message: "Quote fetched successfully",
      quote,
    });
  } catch (err) {
    console.error("[GET QUOTE BY ID ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch the quote",
      error: err.message,
    });
  }
};

// ====================================================
// ACCEPT QUOTE (CUSTOMER)
// ====================================================
exports.acceptQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;

    // Find the selected quote with shipment populated
    const quote = await ShipmentQuote.findById(quoteId).populate("shipment");
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "The selected quote does not exist",
      });
    }

    const shipment = await CustomerShipment.findById(quote.shipment._id);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "The shipment associated with this quote does not exist",
      });
    }

    // Ensure the logged-in customer owns the shipment
    if (shipment.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to accept a quote for this shipment",
      });
    }

    // Accept the quote
    quote.status = "accepted";
    await quote.save();

    // Reject all other quotes for this shipment
    await ShipmentQuote.updateMany(
      { shipment: shipment._id, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    // Update shipment assignment
    shipment.status = "assigned";
    shipment.assignedShipper = quote.shipper;
    await shipment.save();

    // Store a customer confirmation record including customer ID
    await CustomerQuote.create({
      shipmentId: shipment._id,
      customerId: req.user._id,
      shipperId: quote.shipper,
      price: quote.totalPrice || quote.price,
      message: `Customer ${
        req.user.name || req.user.email
      } accepted the quote from shipper ${quote.shipper}`,
      estimatedDeliveryDays: quote.estimatedDeliveryDays || 0,
      status: "accepted",
    });

    res.status(200).json({
      success: true,
      message: `Quote from shipper ${quote.shipper} accepted successfully. Shipment is now assigned.`,
      acceptedQuote: quote,
      shipment: shipment,
    });
  } catch (err) {
    console.error("[ACCEPT QUOTE ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Failed to accept the quote",
      error: err.message,
    });
  }
};
