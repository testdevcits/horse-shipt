const mongoose = require("mongoose");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const { sendQuoteEmail } = require("../../utils/sendQuoteEmail");
const { sendQuoteSms } = require("../../utils/sendQuoteSms");
const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");
const generateContractPDF = require("../../utils/pdf/generateContractPDF"); // PDF utility

// ==============================
// ADD QUOTE (SHIPPER)
// ===============================
exports.addQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const {
      shipment,
      vehicle,
      totalPrice,
      currency = "USD",
      paymentMethod,
      paymentDue,
      pickupTime,
      estimatedArrivalTime,
      estimatedDeliveryDays,
      transportType,
      stallsRequired,
      notes,
      shipperSignature,
    } = req.body;

    // ----------------- VALIDATION -----------------
    if (
      !shipment ||
      !vehicle ||
      !totalPrice ||
      !paymentMethod ||
      !pickupTime ||
      !estimatedArrivalTime ||
      !transportType ||
      !stallsRequired ||
      !shipperSignature
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields and shipper signature must be provided",
      });
    }

    // ----------------- FETCH SHIPMENT -----------------
    const shipmentExists = await CustomerShipment.findById(shipment).populate(
      "customer"
    );
    if (!shipmentExists)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    // ----------------- FETCH VEHICLE -----------------
    const vehicleExists = await ShipperVehicle.findOne({
      _id: vehicle,
      shipper: shipperId,
    });
    if (!vehicleExists)
      return res.status(404).json({
        success: false,
        message: "Vehicle not found or does not belong to you",
      });

    // ----------------- PREVENT DUPLICATE QUOTE -----------------
    const alreadyQuoted = await ShipmentQuote.findOne({
      shipment,
      shipper: shipperId,
    });
    if (alreadyQuoted)
      return res.status(400).json({
        success: false,
        message: "You have already sent a quote for this shipment",
      });

    // ----------------- GENERATE PDF -----------------
    const pdfBuffer = await generateContractPDF({
      shipment: shipmentExists,
      customer: shipmentExists.customer,
      shipper: req.user,
      vehicle: vehicleExists,
      quote: {
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
      },
      shipperSignature,
    });

    // ----------------- GENERATE CONTRACT ID -----------------
    const contractId = new mongoose.Types.ObjectId();

    // ----------------- UPLOAD TO CLOUDINARY -----------------
    const publicId = `shipment_contracts/${shipmentExists.shipmentCode}-${shipperId}`;
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "raw", public_id: publicId },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });

    // ----------------- CREATE QUOTE -----------------
    const quote = await ShipmentQuote.create({
      shipment,
      shipper: shipperId,
      vehicle,
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
      termsAccepted: false,
      contractId, // ✅ required field fixed
      contract: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      },
      shipperSignature,
      customerSignature: null,
      contractAccepted: false,
      contractAcceptedAt: null,
    });

    // ----------------- NOTIFICATIONS -----------------
    let shipperSettings = await ShipperSettings.findOne({ shipperId });
    if (!shipperSettings)
      shipperSettings = await ShipperSettings.create({ shipperId });

    const canEmail = shipperSettings?.notifications?.quote?.email ?? true;
    const canSMS = shipperSettings?.notifications?.quote?.sms ?? true;

    if (canEmail)
      await sendQuoteEmail(
        shipperId,
        "Quote Sent Successfully",
        `Your quote for shipment ${shipment} has been sent successfully.`
      );
    if (canSMS)
      await sendQuoteSms(
        shipperId,
        `Quote sent successfully for shipment ${shipment}.`
      );

    // ----------------- RESPONSE -----------------
    return res
      .status(201)
      .json({ success: true, message: "Quote sent successfully", quote });
  } catch (err) {
    console.error("[ADD QUOTE ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send quote",
      error: err.message,
    });
  }
};

// ---------------- GET MY QUOTES ----------------
exports.getMyQuotes = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const quotes = await ShipmentQuote.find({ shipper: shipperId })
      .populate(
        "shipment",
        "pickupLocation deliveryLocation status pickupDate deliveryDate numberOfHorses shipmentCode"
      )
      .populate("vehicle")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json({ success: true, message: "Quotes fetched successfully", quotes });
  } catch (err) {
    console.error("[GET MY QUOTES ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
      error: err.message,
    });
  }
};

// ---------------- GET QUOTES BY SHIPMENT ----------------
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const quotes = await ShipmentQuote.find({ shipment: shipmentId })
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json({ success: true, message: "Quotes fetched successfully", quotes });
  } catch (err) {
    console.error("[GET QUOTES ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
      error: err.message,
    });
  }
};

// ---------------- GET ACCEPTED QUOTE BY SHIPMENT ----------------
exports.getAcceptedQuoteByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const acceptedQuote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    })
      .populate("shipper", "name email phone")
      .populate("vehicle");

    if (!acceptedQuote)
      return res.status(404).json({
        success: false,
        message: "No accepted quote found for this shipment",
      });

    return res.status(200).json({ success: true, quote: acceptedQuote });
  } catch (error) {
    console.error("Get Accepted Quote Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
