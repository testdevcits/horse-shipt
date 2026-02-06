const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const { PDFDocument } = require("pdf-lib");
const cloudinary = require("../../utils/cloudinary");
const fetch = require("node-fetch");
const streamifier = require("streamifier");

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

/* =========================================================
   CUSTOMER ACCEPT QUOTE WITH SIGNATURE
   -> Existing PDF overwrite with customer signature
========================================================= */
exports.acceptQuoteWithSignature = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { customerSignature } = req.body;
    const customerId = req.user._id;

    if (!customerSignature) {
      return res.status(400).json({
        success: false,
        message: "Customer signature is required",
      });
    }

    // Fetch quote and populate shipment & shipper
    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipment")
      .populate("shipper");

    if (!quote) {
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });
    }

    // Authorization
    if (
      !quote.shipment.customer ||
      quote.shipment.customer.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to accept this quote",
      });
    }

    if (!quote.contract?.url || !quote.contract?.public_id) {
      return res.status(400).json({
        success: false,
        message: "Original contract PDF not found",
      });
    }

    // -------------------- FETCH EXISTING PDF --------------------
    const pdfBufferResponse = await fetch(quote.contract.url);
    const existingPdfBytes = await pdfBufferResponse.arrayBuffer();

    // -------------------- LOAD PDF --------------------
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // -------------------- ADD CUSTOMER SIGNATURE --------------------
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    const signatureBytes = Buffer.from(
      customerSignature.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    const sigDims = signatureImage.scale(0.5); // adjust size
    const x = 350; // X coordinate
    const y = 50; // Y coordinate from bottom

    lastPage.drawImage(signatureImage, {
      x,
      y,
      width: sigDims.width,
      height: sigDims.height,
    });

    // -------------------- SAVE PDF --------------------
    const updatedPdfBytes = await pdfDoc.save();

    // -------------------- UPLOAD TO CLOUDINARY (overwrite same public_id) --------------------
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
    const shipment = await CustomerShipment.findById(quote.shipment._id);
    shipment.status = "assigned";
    shipment.assignedShipper = quote.shipper._id;
    await shipment.save();

    // -------------------- SAVE CUSTOMER QUOTE HISTORY --------------------
    await CustomerQuote.create({
      shipmentId: shipment._id,
      customerId,
      shipperId: quote.shipper._id,
      price: quote.totalPrice,
      message: "Customer accepted quote",
      status: "accepted",
    });

    return res.status(200).json({
      success: true,
      message: "Quote accepted and customer signature added successfully",
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
