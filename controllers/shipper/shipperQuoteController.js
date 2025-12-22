const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const shipperMailSend = require("../../utils/shipperMailSend");
const shipperSmsSend = require("../../utils/shipperSmsSend");

// ====================================================
// SHIPPER SIDE CONTROLLERS
// ====================================================

// ---------------- ADD QUOTE (SHIPPER) ----------------
exports.addQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const {
      shipment,
      totalPrice,
      currency,
      paymentMethod,
      paymentDue,
      pickupTime,
      estimatedArrivalTime,
      estimatedDeliveryDays,
      transportType,
      stallsRequired,
      notes,
    } = req.body;

    // -------- VALIDATION --------
    if (
      !shipment ||
      !totalPrice ||
      !paymentMethod ||
      !paymentDue ||
      !pickupTime ||
      !estimatedArrivalTime ||
      !transportType ||
      !stallsRequired
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // -------- CHECK SHIPMENT --------
    const shipmentExists = await CustomerShipment.findById(shipment);
    if (!shipmentExists) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // -------- PREVENT DUPLICATE QUOTE --------
    const alreadyQuoted = await ShipmentQuote.findOne({
      shipment,
      shipper: shipperId,
    });

    if (alreadyQuoted) {
      return res.status(400).json({
        success: false,
        message: "You have already sent a quote for this shipment",
      });
    }

    // -------- CREATE QUOTE --------
    const quote = await ShipmentQuote.create({
      shipment,
      shipper: shipperId,
      totalPrice,
      currency,
      paymentMethod,
      paymentDue,
      pickupTime,
      estimatedArrivalTime,
      estimatedDeliveryDays,
      transportType,
      stallsRequired,
      notes,
      status: "pending",
    });

    // -------- NOTIFICATIONS --------
    let shipperSettings = await ShipperSettings.findOne({ shipperId });

    if (!shipperSettings) {
      shipperSettings = await ShipperSettings.create({ shipperId });
    }

    const canEmail = shipperSettings?.notifications?.quote?.email ?? true;
    const canSMS = shipperSettings?.notifications?.quote?.sms ?? true;

    if (canEmail) {
      await shipperMailSend(
        shipperId,
        "Quote Sent Successfully",
        `Your quote for shipment ${shipment} has been sent successfully.`
      );
    }

    if (canSMS) {
      await shipperSmsSend(
        shipperId,
        `Quote sent successfully for shipment ${shipment}.`
      );
    }

    return res.status(201).json({
      success: true,
      message: "Quote sent successfully",
      quote,
    });
  } catch (err) {
    console.error("[ADD QUOTE ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send quote",
      error: err.message,
    });
  }
};

// ---------------- GET MY QUOTES (SHIPPER) ----------------
exports.getMyQuotes = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const quotes = await ShipmentQuote.find({ shipper: shipperId })
      .populate(
        "shipment",
        "pickupLocation dropoffLocation shipmentType status pickupDate"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Quotes fetched successfully",
      quotes,
    });
  } catch (err) {
    console.error("[GET MY QUOTES ERROR]:", err);
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

// ---------------- GET QUOTES BY SHIPMENT (CUSTOMER) ----------------
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const quotes = await ShipmentQuote.find({ shipment: shipmentId })
      .populate("shipper", "name email phone companyName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Quotes fetched successfully",
      quotes,
    });
  } catch (err) {
    console.error("[GET QUOTES ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
      error: err.message,
    });
  }
};

// ---------------- ACCEPT QUOTE (CUSTOMER) ----------------
exports.acceptQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;

    const quote = await ShipmentQuote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // -------- ACCEPT THIS QUOTE --------
    quote.status = "accepted";
    await quote.save();

    // -------- REJECT OTHERS --------
    await ShipmentQuote.updateMany(
      { shipment: quote.shipment, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    // -------- UPDATE SHIPMENT --------
    await CustomerShipment.findByIdAndUpdate(quote.shipment, {
      status: "assigned",
      assignedShipper: quote.shipper,
    });

    // -------- NOTIFY SHIPPER --------
    const shipperSettings = await ShipperSettings.findOne({
      shipperId: quote.shipper,
    });

    const canEmail = shipperSettings?.notifications?.shipment?.email ?? true;
    const canSMS = shipperSettings?.notifications?.shipment?.sms ?? true;

    if (canEmail) {
      await shipperMailSend(
        quote.shipper,
        "Quote Accepted 🎉",
        `Your quote for shipment ${quote.shipment} has been accepted.`
      );
    }

    if (canSMS) {
      await shipperSmsSend(
        quote.shipper,
        `Your quote for shipment ${quote.shipment} was accepted.`
      );
    }

    res.status(200).json({
      success: true,
      message: "Quote accepted successfully",
      acceptedQuote: quote,
    });
  } catch (err) {
    console.error("[ACCEPT QUOTE ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Failed to accept quote",
      error: err.message,
    });
  }
};
