const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const Customer = require("../../models/customer/customerModel");
const PDFDocument = require("pdfkit");
const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");

// ---------------- GET ALL QUOTES FOR A SHIPMENT ----------------
exports.getQuotesByShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customerId",
      "name email"
    );
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (shipment.customerId._id.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    const quotes = await ShipmentQuote.find({ shipment: shipmentId })
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, quotes });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch quotes",
        error: err.message,
      });
  }
};

// ---------------- GET SINGLE QUOTE BY ID ----------------
exports.getQuoteById = async (req, res) => {
  try {
    const { quoteId } = req.params;

    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .populate({
        path: "shipment",
        select: "customerId",
        populate: { path: "customerId", select: "name email" },
      });

    if (!quote)
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });

    if (quote.shipment.customerId._id.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    res.status(200).json({ success: true, quote });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch the quote",
        error: err.message,
      });
  }
};

// ---------------- CUSTOMER ACCEPT & SIGN QUOTE ----------------
exports.acceptQuoteWithSignature = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { customerSignature } = req.body;

    if (!customerSignature)
      return res
        .status(400)
        .json({ success: false, message: "Customer signature is required" });

    const quote = await ShipmentQuote.findById(quoteId).populate("shipment");
    if (!quote)
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });

    const shipment = await CustomerShipment.findById(quote.shipment._id);
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (shipment.customerId.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({
          success: false,
          message: "Not authorized to accept this quote",
        });

    // ---------------- UPDATE PDF WITH CUSTOMER SIGNATURE ----------------
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));

    // Add previous contract details (could be improved by storing fields separately)
    doc.fontSize(12).text(`Shipment Contract for Quote: ${quote._id}`);
    doc.moveDown();
    doc.text(`Shipper: ${quote.shipper}`);
    doc.text(`Customer: ${req.user.name}`);
    doc.text(`Total Price: ${quote.totalPrice}`);
    doc.moveDown();

    // Add customer signature
    const img = Buffer.from(
      customerSignature.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );
    doc.text("Customer Signature:");
    doc.image(img, { width: 150, height: 50 });
    doc.end();

    const pdfBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // Upload signed PDF
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "raw", folder: "shipment_contracts" },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });

    // ---------------- UPDATE QUOTE ----------------
    quote.contract.url = uploadResult.secure_url;
    quote.contract.public_id = uploadResult.public_id;
    quote.customerSignature = customerSignature;
    quote.contractAccepted = true;
    quote.contractAcceptedAt = new Date();
    quote.status = "accepted";
    await quote.save();

    // Reject all other quotes
    await ShipmentQuote.updateMany(
      { shipment: shipment._id, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    // Update shipment
    shipment.status = "assigned";
    shipment.assignedShipper = quote.shipper;
    await shipment.save();

    // Record in CustomerQuote
    await CustomerQuote.create({
      shipmentId: shipment._id,
      customerId: req.user._id,
      shipperId: quote.shipper,
      price: quote.totalPrice,
      message: `Customer ${req.user.name} accepted quote`,
      estimatedDeliveryDays: quote.estimatedDeliveryDays,
      status: "accepted",
    });

    res.status(200).json({
      success: true,
      message: "Quote accepted and signed successfully",
      quote,
      shipment,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to accept quote",
        error: err.message,
      });
  }
};
