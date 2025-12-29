const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const PDFDocument = require("pdfkit");
const cloudinary = require("../../utils/cloudinary");
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
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // Fetch shipment and populate customer
    const shipment = await CustomerShipment.findById(
      quote.shipment._id
    ).populate("customer");

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
        message: "Not authorized to accept this quote",
      });
    }

    // Validate signature buffer
    const signatureBuffer = Buffer.from(
      customerSignature.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

    if (!signatureBuffer || signatureBuffer.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    /* =====================================================
       GENERATE CONTRACT PDF
    ===================================================== */
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));

    doc.fontSize(16).text("Shipment Contract", { underline: true });
    doc.moveDown();

    doc.fontSize(12).text(`Quote ID: ${quote._id}`);
    doc.text(`Customer: ${shipment.customer.name}`);
    doc.text(`Shipper: ${quote.shipper?.companyName || quote.shipper?.name}`);
    doc.text(`Total Price: ${quote.totalPrice}`);
    doc.text(`Payment Method: ${quote.paymentMethod}`);
    doc.moveDown();

    doc.text("Customer Signature:");
    doc.image(signatureBuffer, { width: 150, height: 60 });
    doc.end();

    const pdfBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    /* =====================================================
       UPLOAD PDF TO CLOUDINARY
    ===================================================== */
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "raw", folder: "shipment_contracts" },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });

    /* =====================================================
       UPDATE QUOTE
    ===================================================== */
    quote.customerSignature = customerSignature;
    quote.contract = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
    quote.contractAccepted = true;
    quote.contractAcceptedAt = new Date();
    quote.status = "accepted";
    await quote.save();

    // Reject other quotes
    await ShipmentQuote.updateMany(
      { shipment: shipment._id, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    // Update shipment
    shipment.status = "assigned";
    shipment.assignedShipper = quote.shipper._id;
    await shipment.save();

    // Save customer quote history
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
