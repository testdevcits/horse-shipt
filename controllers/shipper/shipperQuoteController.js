const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const { sendQuoteEmail } = require("../../utils/sendQuoteEmail");
const { sendQuoteSms } = require("../../utils/sendQuoteSms");
const PDFDocument = require("pdfkit");
const cloudinary = require("../../utils/cloudinary"); // Cloudinary config
const streamifier = require("streamifier");
const fs = require("fs");
const path = require("path");

// ====================================================
// SHIPPER SIDE CONTROLLERS
// ====================================================

// ---------------- ADD QUOTE (SHIPPER) ----------------
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
      shipperSignature, // base64 string (required)
    } = req.body;

    // -------- VALIDATION --------
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

    // -------- CHECK SHIPMENT --------
    const shipmentExists = await CustomerShipment.findById(shipment).populate(
      "customer"
    );
    if (!shipmentExists)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    // -------- CHECK VEHICLE --------
    const vehicleExists = await ShipperVehicle.findOne({
      _id: vehicle,
      shipper: shipperId,
    });
    if (!vehicleExists)
      return res.status(404).json({
        success: false,
        message: "Vehicle not found or does not belong to you",
      });

    // -------- PREVENT DUPLICATE QUOTE --------
    const alreadyQuoted = await ShipmentQuote.findOne({
      shipment,
      shipper: shipperId,
    });
    if (alreadyQuoted)
      return res.status(400).json({
        success: false,
        message: "You have already sent a quote for this shipment",
      });

    // -------- GENERATE PDF --------
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];

    // Listen to PDF stream
    doc.on("data", buffers.push.bind(buffers));

    // -------- HEADER WITH LOGO --------
    const logoPath = path.join(__dirname, "../../assets/logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 15, { width: 50 });
    }
    doc.fontSize(20).text("HorseShipt", 110, 25, { align: "left" });
    doc.moveDown(2);

    // -------- CONTRACT TITLE --------
    doc.fontSize(18).text("Shipment Contract", { align: "center" });
    doc.moveDown();

    // -------- CUSTOMER INFO --------
    doc.fontSize(12).text(`Customer Name: ${shipmentExists.customer.name}`);
    doc.text(`Customer Email: ${shipmentExists.customer.email}`);
    doc.text(`Shipment ID: ${shipmentExists._id}`);
    doc.moveDown();

    // -------- SHIPMENT DETAILS --------
    doc.text(`Pickup Location: ${shipmentExists.pickupLocation}`);
    doc.text(`Pickup Date: ${shipmentExists.pickupDate}`);
    doc.text(`Delivery Location: ${shipmentExists.deliveryLocation}`);
    doc.text(`Delivery Date: ${shipmentExists.deliveryDate}`);
    doc.text(`Number of Horses: ${shipmentExists.numberOfHorses}`);
    doc.text(`Estimated Delivery Days: ${estimatedDeliveryDays || "N/A"}`);
    doc.moveDown();

    // -------- SHIPPER DETAILS --------
    doc.text(`Shipper Name: ${req.user.name}`);
    doc.text(`Shipper Email: ${req.user.email}`);
    doc.text(`Vehicle: ${vehicleExists.name}`);
    doc.text(`Transport Type: ${transportType}`);
    doc.text(`Total Price: ${totalPrice} ${currency}`);
    doc.text(`Payment Method: ${paymentMethod}`);
    doc.text(`Payment Due: ${paymentDue}`);
    doc.text(`Pickup Time: ${pickupTime}`);
    doc.text(`Estimated Arrival Time: ${estimatedArrivalTime}`);
    doc.text(`Stalls Required: ${stallsRequired}`);
    if (notes) doc.text(`Notes: ${notes}`);
    doc.moveDown(2);

    // -------- SHIPPER SIGNATURE --------
    const imgBuffer = Buffer.from(
      shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );
    doc.text("Shipper Signature:");
    doc.image(imgBuffer, { width: 150, height: 50 });
    doc.moveDown();

    // -------- CUSTOMER SIGNATURE PLACEHOLDER --------
    doc.text("Customer Signature: ____________________");
    doc.end();

    // -------- CONVERT PDF TO BUFFER --------
    const pdfBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // -------- UPLOAD TO CLOUDINARY --------
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "raw", folder: "shipment_contracts" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });

    // -------- CREATE QUOTE --------
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
      contract: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      },
      shipperSignature,
      customerSignature: null,
      contractAccepted: false,
      contractAcceptedAt: null,
    });

    // -------- NOTIFICATIONS --------
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

    return res.status(201).json({
      success: true,
      message: "Quote sent successfully",
      quote,
    });
  } catch (err) {
    console.error("[ADD QUOTE ERROR]:", err);
    return res.status(500).json({
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
        "pickupLocation deliveryLocation status pickupDate deliveryDate numberOfHorses"
      )
      .populate("vehicle")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Quotes fetched successfully",
      quotes,
    });
  } catch (err) {
    console.error("[GET MY QUOTES ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
      error: err.message,
    });
  }
};

// ---------------- GET QUOTES BY SHIPMENT (CUSTOMER SIDE) ----------------
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const quotes = await ShipmentQuote.find({ shipment: shipmentId })
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Quotes fetched successfully",
      quotes,
    });
  } catch (err) {
    console.error("[GET QUOTES ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
      error: err.message,
    });
  }
};

/* ====================================================
   GET ACCEPTED QUOTE BY SHIPMENT
==================================================== */
exports.getAcceptedQuoteByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const acceptedQuote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    })
      .populate("shipper", "name email phone")
      .populate("vehicle");

    if (!acceptedQuote) {
      return res.status(404).json({
        success: false,
        message: "No accepted quote found for this shipment",
      });
    }

    return res.status(200).json({
      success: true,
      quote: acceptedQuote,
    });
  } catch (error) {
    console.error("Get Accepted Quote Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
