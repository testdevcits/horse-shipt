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

    console.log("DEBUG: shipmentId:", shipmentId);
    console.log("DEBUG: customerId:", customerId);

    // Validate shipment
    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customerId",
      "name email"
    );

    if (!shipment) {
      console.log("DEBUG: Shipment not found for ID:", shipmentId);
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // Authorization
    if (shipment.customerId._id.toString() !== customerId.toString()) {
      console.log(
        "DEBUG: Unauthorized access. Shipment customerId:",
        shipment.customerId._id.toString(),
        "Requesting customerId:",
        customerId.toString()
      );
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

    console.log("DEBUG: Quotes fetched:", quotes.length);

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
        select: "customerId",
        populate: {
          path: "customerId",
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
    if (quote.shipment.customerId._id.toString() !== customerId.toString()) {
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

    // 1️⃣ Fetch quote
    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipment")
      .populate("shipper");

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // 2️⃣ Fetch shipment
    const shipment = await CustomerShipment.findById(quote.shipment._id);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // 3️⃣ Authorization
    if (shipment.customerId.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to accept this quote",
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
    doc.text(`Customer: ${req.user.name}`);
    doc.text(`Shipper: ${quote.shipper?.companyName || quote.shipper?.name}`);
    doc.text(`Total Price: ${quote.totalPrice}`);
    doc.text(`Payment Method: ${quote.paymentMethod}`);
    doc.moveDown();

    // Customer Signature
    const signatureBuffer = Buffer.from(
      customerSignature.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

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
        {
          resource_type: "raw",
          folder: "shipment_contracts",
        },
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

    res.status(200).json({
      success: true,
      message: "Quote accepted and contract signed successfully",
      quote,
    });
  } catch (error) {
    console.error("acceptQuoteWithSignature error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to accept quote",
    });
  }
};
