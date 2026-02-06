const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const { PDFDocument } = require("pdf-lib");
const cloudinary = require("../../utils/cloudinary");
const fetch = require("node-fetch");
const streamifier = require("streamifier");

exports.acceptQuoteWithSignature = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { customerSignature } = req.body;
    const customerId = req.user._id;

    // -------------------- VALIDATION --------------------
    if (
      !customerSignature ||
      typeof customerSignature !== "string" ||
      !customerSignature.startsWith("data:image/")
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid customer signature is required",
      });
    }

    // -------------------- FETCH QUOTE --------------------
    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipment")
      .populate("shipper");

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // -------------------- PREVENT DOUBLE ACCEPT --------------------
    if (quote.contractAccepted) {
      return res.status(400).json({
        success: false,
        message: "Quote already accepted",
      });
    }

    // -------------------- AUTHORIZATION --------------------
    if (
      !quote.shipment?.customer ||
      quote.shipment.customer.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to accept this quote",
      });
    }

    // -------------------- CONTRACT CHECK --------------------
    if (!quote.contract?.url || !quote.contract?.public_id) {
      return res.status(400).json({
        success: false,
        message: "Original contract PDF not found",
      });
    }

    if (!quote.shipperSignature) {
      return res.status(400).json({
        success: false,
        message: "Shipper signature missing in contract",
      });
    }

    // -------------------- FETCH EXISTING PDF --------------------
    const pdfResponse = await fetch(quote.contract.url);
    const existingPdfBytes = await pdfResponse.arrayBuffer();

    // -------------------- LOAD PDF --------------------
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    // -------------------- EMBED CUSTOMER SIGNATURE --------------------
    const customerSigBytes = Buffer.from(
      customerSignature.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

    const customerSigImage = await pdfDoc.embedPng(customerSigBytes);

    // ✅ EXACT SAME SIZE AS SHIPPER (PDFKit side)
    const SIGN_WIDTH = 150;
    const SIGN_HEIGHT = 50;

    // ✅ MATCH PDFKIT POSITION (right side)
    const X = 350;
    const Y = 50;

    lastPage.drawImage(customerSigImage, {
      x: X,
      y: Y,
      width: SIGN_WIDTH,
      height: SIGN_HEIGHT,
    });

    // -------------------- SAVE UPDATED PDF --------------------
    const updatedPdfBytes = await pdfDoc.save();

    // -------------------- UPLOAD TO CLOUDINARY (OVERWRITE) --------------------
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          public_id: quote.contract.public_id,
          overwrite: true,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );

      streamifier
        .createReadStream(Buffer.from(updatedPdfBytes))
        .pipe(uploadStream);
    });

    // -------------------- UPDATE QUOTE --------------------
    quote.customerSignature = customerSignature;
    quote.contract.url = uploadResult.secure_url;
    quote.contractAccepted = true;
    quote.contractAcceptedAt = new Date();
    quote.status = "accepted";
    await quote.save();

    // -------------------- REJECT OTHER QUOTES --------------------
    await ShipmentQuote.updateMany(
      { shipment: quote.shipment._id, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    // -------------------- UPDATE SHIPMENT --------------------
    await CustomerShipment.findByIdAndUpdate(quote.shipment._id, {
      status: "assigned",
      assignedShipper: quote.shipper._id,
    });

    // -------------------- SAVE CUSTOMER QUOTE HISTORY --------------------
    await CustomerQuote.create({
      shipmentId: quote.shipment._id,
      customerId,
      shipperId: quote.shipper._id,
      price: quote.totalPrice,
      message: "Customer accepted quote",
      status: "accepted",
    });

    return res.status(200).json({
      success: true,
      message: "Quote accepted and contract signed successfully",
      quote,
    });
  } catch (error) {
    console.error("acceptQuoteWithSignature error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to accept quote",
    });
  }
};

/* =========================================================
   GET ALL QUOTES BY SHIPMENT ID (CUSTOMER)
========================================================= */
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const customerId = req.user._id;

    // Validate shipment
    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer",
      "name email"
    );

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // Authorization
    if (
      !shipment.customer ||
      shipment.customer._id.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view these quotes",
      });
    }

    // Fetch quotes
    const quotes = await ShipmentQuote.find({ shipment: shipmentId })
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      shipmentId,
      totalQuotes: quotes.length,
      quotes,
    });
  } catch (error) {
    console.error("getQuotesByShipment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotes",
    });
  }
};

/* =========================================================
   GET SINGLE QUOTE DETAIL (CUSTOMER)
========================================================= */
exports.getQuoteById = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const customerId = req.user._id;

    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .populate({
        path: "shipment",
        select: "customer",
        populate: {
          path: "customer",
          select: "name email",
        },
      });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // Authorization
    if (
      !quote.shipment.customer ||
      quote.shipment.customer._id.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this quote",
      });
    }

    res.status(200).json({
      success: true,
      quote,
    });
  } catch (error) {
    console.error("getQuoteById error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quote details",
    });
  }
};
