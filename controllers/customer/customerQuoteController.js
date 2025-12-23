const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");

// ====================================================
// ADD QUOTE (SHIPPER)
// ====================================================
exports.addQuote = async (req, res) => {
  try {
    const { shipmentId, price, message, estimatedDeliveryDays } = req.body;
    const shipperId = req.user._id;

    if (!shipmentId || !price) {
      return res.status(400).json({
        success: false,
        message: "Shipment ID and price are required",
      });
    }

    // Check shipment exists
    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // Prevent duplicate quote
    const alreadyQuoted = await CustomerQuote.findOne({
      shipmentId,
      shipperId,
    });

    if (alreadyQuoted) {
      return res.status(400).json({
        success: false,
        message: "You already sent a quote for this shipment",
      });
    }

    const quote = await CustomerQuote.create({
      shipmentId,
      shipperId,
      price,
      message,
      estimatedDeliveryDays,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Quote sent successfully",
      quote,
    });
  } catch (err) {
    console.error("Add Quote Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send quote",
      error: err.message,
    });
  }
};

// ====================================================
// GET MY QUOTES (SHIPPER)
// ====================================================
exports.getMyQuotes = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const quotes = await CustomerQuote.find({ shipperId })
      .populate(
        "shipmentId",
        "pickupLocation dropoffLocation status pickupDate"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      quotes,
    });
  } catch (err) {
    console.error("Get My Quotes Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
    });
  }
};

// ====================================================
// GET QUOTES FOR A SHIPMENT (CUSTOMER)
// ====================================================
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const quotes = await CustomerQuote.find({ shipmentId })
      .populate("shipperId", "name email phone companyName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      quotes,
    });
  } catch (err) {
    console.error("Get Quotes Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
    });
  }
};

// ====================================================
// ACCEPT QUOTE (CUSTOMER)
// ====================================================
exports.acceptQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;

    const quote = await CustomerQuote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // Accept selected quote
    quote.status = "accepted";
    await quote.save();

    // Reject other quotes for same shipment
    await CustomerQuote.updateMany(
      {
        shipmentId: quote.shipmentId,
        _id: { $ne: quote._id },
      },
      { status: "rejected" }
    );

    // Assign shipment to shipper
    await CustomerShipment.findByIdAndUpdate(quote.shipmentId, {
      status: "assigned",
      assignedShipper: quote.shipperId,
    });

    res.status(200).json({
      success: true,
      message: "Quote accepted successfully",
    });
  } catch (err) {
    console.error("Accept Quote Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to accept quote",
    });
  }
};
