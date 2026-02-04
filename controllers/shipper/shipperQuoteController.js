const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const { sendQuoteEmail } = require("../../utils/sendQuoteEmail");
const { sendQuoteSms } = require("../../utils/sendQuoteSms");
const PDFDocument = require("pdfkit");
const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ====================================================
// UTILITY: Format Date
// ====================================================
function formatDate(date) {
  if (!date) return "N/A";
  const d = new Date(date);
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return d.toLocaleDateString("en-US", options); // e.g., "Tuesday, February 10, 2026"
}

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
      shipperSignature,
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
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));

    // -------- FONTS --------
    const robotoRegular = path.join(
      __dirname,
      "../../assets/fonts/RobotoSlab-Regular.ttf"
    );
    const openSansBold = path.join(
      __dirname,
      "../../assets/fonts/OpenSans-Bold.ttf"
    );
    const oswaldBold = path.join(
      __dirname,
      "../../assets/fonts/Oswald-Bold.ttf"
    );

    // -------- HEADER LOGO --------
    const logoPath = path.join(__dirname, "../../assets/logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 15, { width: 50 });
    }

    doc
      .font(oswaldBold)
      .fontSize(20)
      .text("HorseShipt", 110, 25, { align: "left" });
    doc.moveDown(2);

    // -------- CONTRACT TITLE --------
    doc
      .font(openSansBold)
      .fontSize(18)
      .text("Shipment Contract", { align: "center" });
    doc.moveDown(1);

    // -------- CUSTOMER INFO --------
    doc
      .font(openSansBold)
      .fontSize(12)
      .text("Customer Information", { underline: true });
    doc.moveDown(0.5);
    doc
      .font(openSansBold)
      .text("Name:", { continued: true })
      .font(robotoRegular)
      .text(` ${shipmentExists.customer.name}`);
    doc
      .font(openSansBold)
      .text("Email:", { continued: true })
      .font(robotoRegular)
      .text(` ${shipmentExists.customer.email}`);
    doc
      .font(openSansBold)
      .text("Shipment ID:", { continued: true })
      .font(robotoRegular)
      .text(` ${shipmentExists._id}`);
    doc.moveDown(1);

    // -------- SHIPMENT DETAILS --------
    doc.font(openSansBold).text("Shipment Details", { underline: true });
    doc.moveDown(0.5);
    doc
      .font(openSansBold)
      .text("Pickup Location:", { continued: true })
      .font(robotoRegular)
      .text(` ${shipmentExists.pickupLocation}`);
    doc
      .font(openSansBold)
      .text("Pickup Date:", { continued: true })
      .font(robotoRegular)
      .text(` ${formatDate(shipmentExists.pickupDate)}`);
    doc
      .font(openSansBold)
      .text("Delivery Location:", { continued: true })
      .font(robotoRegular)
      .text(` ${shipmentExists.deliveryLocation}`);
    doc
      .font(openSansBold)
      .text("Delivery Date:", { continued: true })
      .font(robotoRegular)
      .text(` ${formatDate(shipmentExists.deliveryDate)}`);
    doc
      .font(openSansBold)
      .text("Number of Horses:", { continued: true })
      .font(robotoRegular)
      .text(` ${shipmentExists.numberOfHorses}`);
    doc
      .font(openSansBold)
      .text("Estimated Delivery Days:", { continued: true })
      .font(robotoRegular)
      .text(` ${estimatedDeliveryDays || "N/A"}`);
    doc.moveDown(1);

    // -------- SHIPPER DETAILS --------
    doc.font(openSansBold).text("Shipper Details", { underline: true });
    doc.moveDown(0.5);
    doc
      .font(openSansBold)
      .text("Name:", { continued: true })
      .font(robotoRegular)
      .text(` ${req.user.name}`);
    doc
      .font(openSansBold)
      .text("Email:", { continued: true })
      .font(robotoRegular)
      .text(` ${req.user.email}`);
    doc
      .font(openSansBold)
      .text("Vehicle:", { continued: true })
      .font(robotoRegular)
      .text(` ${vehicleExists.name}`);
    doc
      .font(openSansBold)
      .text("Transport Type:", { continued: true })
      .font(robotoRegular)
      .text(` ${transportType}`);
    doc
      .font(openSansBold)
      .text("Total Price:", { continued: true })
      .font(robotoRegular)
      .text(` ${totalPrice} ${currency}`);
    doc
      .font(openSansBold)
      .text("Payment Method:", { continued: true })
      .font(robotoRegular)
      .text(` ${paymentMethod}`);
    doc
      .font(openSansBold)
      .text("Payment Due:", { continued: true })
      .font(robotoRegular)
      .text(` ${paymentDue}`);
    doc
      .font(openSansBold)
      .text("Pickup Time:", { continued: true })
      .font(robotoRegular)
      .text(` ${pickupTime}`);
    doc
      .font(openSansBold)
      .text("Estimated Arrival Time:", { continued: true })
      .font(robotoRegular)
      .text(` ${estimatedArrivalTime}`);
    doc
      .font(openSansBold)
      .text("Stalls Required:", { continued: true })
      .font(robotoRegular)
      .text(` ${stallsRequired}`);
    if (notes)
      doc
        .font(openSansBold)
        .text("Notes:", { continued: true })
        .font(robotoRegular)
        .text(` ${notes}`);
    doc.moveDown(2);

    // -------- SIGNATURES --------
    const imgBuffer = Buffer.from(
      shipperSignature.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );
    const pageWidth = doc.page.width;
    const bottomY = doc.page.height - 150;

    // Shipper signature left
    doc.font(openSansBold).text("Shipper Signature:", 50, bottomY);
    doc.image(imgBuffer, 50, bottomY + 20, { width: 150, height: 50 });

    // Customer signature placeholder right
    doc
      .font(openSansBold)
      .text("Customer Signature:", pageWidth - 250, bottomY);
    doc.rect(pageWidth - 250, bottomY + 20, 150, 50).stroke();

    doc.end();

    // -------- CONVERT PDF TO BUFFER --------
    const pdfBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // -------- UPLOAD TO CLOUDINARY --------
    const uniqueName = `shipment_contract_${crypto
      .randomBytes(8)
      .toString("hex")}.pdf`;
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: "shipment_contracts",
          public_id: uniqueName,
        },
        (error, result) => (error ? reject(error) : resolve(result))
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

    return res
      .status(201)
      .json({ success: true, message: "Quote sent successfully", quote });
  } catch (err) {
    console.error("[ADD QUOTE ERROR]:", err);
    return res
      .status(500)
      .json({
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
        "pickupLocation deliveryLocation status pickupDate deliveryDate numberOfHorses"
      )
      .populate("vehicle")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json({ success: true, message: "Quotes fetched successfully", quotes });
  } catch (err) {
    console.error("[GET MY QUOTES ERROR]:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch quotes",
        error: err.message,
      });
  }
};

// ---------------- GET QUOTES BY SHIPMENT (CUSTOMER) ----------------
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
    return res
      .status(500)
      .json({
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
      return res
        .status(404)
        .json({
          success: false,
          message: "No accepted quote found for this shipment",
        });

    return res.status(200).json({ success: true, quote: acceptedQuote });
  } catch (error) {
    console.error("Get Accepted Quote Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
