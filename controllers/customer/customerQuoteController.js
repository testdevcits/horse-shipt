const Quote = require("../../models/QuoteModel");
const Shipment = require("../../models/shipper/shipperModel");

// ---------------- Add Quote (for Shipper) ----------------
exports.addQuote = async (req, res) => {
  try {
    const { shipmentId, price, message, estimatedDeliveryDays } = req.body;
    const shipperId = req.user._id;

    if (!shipmentId || !price)
      return res.status(400).json({
        success: false,
        message: "Shipment ID and price are required",
      });

    const existingQuote = await Quote.findOne({ shipmentId, shipperId });
    if (existingQuote)
      return res.status(400).json({
        success: false,
        message: "You already sent a quote for this shipment",
      });

    const quote = await Quote.create({
      shipmentId,
      shipperId,
      price,
      message,
      estimatedDeliveryDays,
      status: "pending",
    });

    res.status(201).json({ success: true, quote });
  } catch (err) {
    console.error("Add Quote Error:", err);
    res.status(500).json({ success: false, message: "Failed to send quote" });
  }
};

// ---------------- Get My Quotes (for Shipper) ----------------
exports.getMyQuotes = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const quotes = await Quote.find({ shipperId }).populate("shipmentId");
    res.status(200).json({ success: true, quotes });
  } catch (err) {
    console.error("Get My Quotes Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch quotes" });
  }
};

// ---------------- Get Quotes for My Shipment (for Customer) ----------------
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const quotes = await Quote.find({ shipmentId })
      .populate("shipperId", "name email phone")
      .sort({ createdAt: -1 });

    res.json({ success: true, quotes });
  } catch (err) {
    console.error("Get Quotes Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------- Accept a Quote (for Customer) ----------------
exports.acceptQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;

    const quote = await Quote.findById(quoteId);
    if (!quote)
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });

    // Mark accepted quote
    quote.status = "accepted";
    await quote.save();

    // Reject other quotes for same shipment
    await Quote.updateMany(
      { shipmentId: quote.shipmentId, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    // Update Shipment
    await Shipment.findByIdAndUpdate(quote.shipmentId, {
      status: "accepted",
      assignedShipper: quote.shipperId,
    });

    res.json({ success: true, message: "Quote accepted successfully" });
  } catch (err) {
    console.error("Accept Quote Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
