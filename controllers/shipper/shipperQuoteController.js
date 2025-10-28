const Quote = require("../../models/QuoteModel");
const Shipment = require("../../models/shipper/shipperModel");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const shipperMailSend = require("../../utils/shipperMailSend");
const shipperSmsSend = require("../../utils/shipperSmsSend");

// ====================================================
// SHIPPER SIDE CONTROLLERS
// ====================================================

// ---------------- Add Quote (for Shipper) ----------------
exports.addQuote = async (req, res) => {
  try {
    const { shipmentId, price, message, estimatedDeliveryDays } = req.body;
    const shipperId = req.user._id;

    // Validate inputs
    if (!shipmentId || !price) {
      return res.status(400).json({
        success: false,
        message: "Shipment ID and price are required",
      });
    }

    // Check if shipment exists
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // Check if shipper already sent a quote for this shipment
    const existingQuote = await Quote.findOne({ shipmentId, shipperId });
    if (existingQuote) {
      return res.status(400).json({
        success: false,
        message: "You already sent a quote for this shipment",
      });
    }

    // Create new quote
    const quote = await Quote.create({
      shipmentId,
      shipperId,
      price,
      message,
      estimatedDeliveryDays,
      status: "pending",
    });

    // ===========================
    // Notify Shipper if allowed
    // ===========================
    const shipperSettings = await ShipperSettings.findOne({ shipperId });

    // If settings missing (first time), create defaults (all true)
    if (!shipperSettings) {
      await ShipperSettings.create({ shipperId });
    }

    // If notifications enabled for "quote"
    const canEmail = shipperSettings?.notifications?.quote?.email ?? true;
    const canSMS = shipperSettings?.notifications?.quote?.sms ?? true;

    if (canEmail) {
      await shipperMailSend(
        shipperId,
        "Quote Sent Successfully",
        `You have successfully sent a quote for shipment ${shipmentId}.`
      );
    }

    if (canSMS) {
      await shipperSmsSend(
        shipperId,
        `Quote sent successfully for shipment ${shipmentId}.`
      );
    }

    return res.status(201).json({
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

// ---------------- Get My Quotes (for Shipper) ----------------
exports.getMyQuotes = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const quotes = await Quote.find({ shipperId })
      .populate(
        "shipmentId",
        "pickupLocation dropoffLocation shipmentType status"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Fetched all your quotes successfully",
      quotes,
    });
  } catch (err) {
    console.error("Get My Quotes Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
      error: err.message,
    });
  }
};

// ====================================================
// CUSTOMER SIDE CONTROLLERS
// ====================================================

// ---------------- Get Quotes for a Shipment (for Customer) ----------------
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const quotes = await Quote.find({ shipmentId })
      .populate("shipperId", "name email phone companyName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Fetched all quotes for this shipment",
      quotes,
    });
  } catch (err) {
    console.error("Get Quotes Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
      error: err.message,
    });
  }
};

// ---------------- Accept a Quote (for Customer) ----------------
exports.acceptQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;

    // Find quote
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // Mark this quote as accepted
    quote.status = "accepted";
    await quote.save();

    // Reject all other quotes for the same shipment
    await Quote.updateMany(
      { shipmentId: quote.shipmentId, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    // Update Shipment status and assign the shipper
    await Shipment.findByIdAndUpdate(quote.shipmentId, {
      status: "accepted",
      assignedShipper: quote.shipperId,
    });

    // ===========================
    // Notify Shipper (accepted)
    // ===========================
    const shipperSettings = await ShipperSettings.findOne({
      shipperId: quote.shipperId,
    });

    const canEmail = shipperSettings?.notifications?.shipment?.email ?? true;
    const canSMS = shipperSettings?.notifications?.shipment?.sms ?? true;

    if (canEmail) {
      await shipperMailSend(
        quote.shipperId,
        "Quote Accepted",
        `Your quote for shipment ${quote.shipmentId} has been accepted by the customer!`
      );
    }

    if (canSMS) {
      await shipperSmsSend(
        quote.shipperId,
        `Your quote for shipment ${quote.shipmentId} was accepted!`
      );
    }

    res.status(200).json({
      success: true,
      message: "Quote accepted successfully",
      acceptedQuote: quote,
    });
  } catch (err) {
    console.error("Accept Quote Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to accept quote",
      error: err.message,
    });
  }
};
