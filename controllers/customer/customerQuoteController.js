const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");

const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");
const generateContractPDF = require("../../utils/pdf/generateContractPDF");

/* =========================================================
   ACCEPT QUOTE (RE-GENERATE PDF WITH CUSTOMER SIGNATURE)
========================================================= */
exports.acceptQuoteWithSignature = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { customerSignature } = req.body;
    const customerId = req.user._id;

    /* ---------------- VALIDATION ---------------- */
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

    /* ---------------- FETCH QUOTE ---------------- */
    const quote = await ShipmentQuote.findById(quoteId)
      .populate({
        path: "shipment",
        populate: { path: "customer" },
      })
      .populate("shipper")
      .populate("vehicle");

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    if (quote.contractAccepted) {
      return res.status(400).json({
        success: false,
        message: "Quote already accepted",
      });
    }

    /* ---------------- AUTH ---------------- */
    if (quote.shipment.customer._id.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (!quote.shipperSignature) {
      return res.status(400).json({
        success: false,
        message: "Shipper signature missing",
      });
    }

    /* ---------------- RE-GENERATE PDF ---------------- */
    const pdfBuffer = await generateContractPDF({
      shipment: quote.shipment,
      shipmentCode: quote.shipment.shipmentCode,
      customer: quote.shipment.customer,
      shipper: quote.shipper,
      vehicle: quote.vehicle,
      quote: {
        totalPrice: quote.totalPrice,
        currency: quote.currency,
        paymentMethod: quote.paymentMethod,
        paymentDue: quote.paymentDue,
        pickupTime: quote.pickupTime,
        estimatedArrivalTime: quote.estimatedArrivalTime,
        estimatedDeliveryDays: quote.estimatedDeliveryDays,
        transportType: quote.transportType,
        stallsRequired: quote.stallsRequired,
        notes: quote.notes,
      },
      shipperSignature: quote.shipperSignature,
      customerSignature,
    });

    /* ---------------- OVERWRITE SAME PDF ---------------- */
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          public_id: quote.contract.public_id, // SAME FILE
          overwrite: true,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );

      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });

    /* ---------------- UPDATE DB ---------------- */
    quote.customerSignature = customerSignature;
    quote.contract.url = uploadResult.secure_url;
    quote.contractAccepted = true;
    quote.contractAcceptedAt = new Date();
    quote.status = "accepted";
    await quote.save();

    /* ---------------- REJECT OTHER QUOTES ---------------- */
    await ShipmentQuote.updateMany(
      { shipment: quote.shipment._id, _id: { $ne: quote._id } },
      { status: "rejected" }
    );

    /* ---------------- UPDATE SHIPMENT ---------------- */
    await CustomerShipment.findByIdAndUpdate(quote.shipment._id, {
      status: "assigned",
      assignedShipper: quote.shipper._id,
    });

    /* ---------------- CUSTOMER QUOTE HISTORY ---------------- */
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
      message: "Quote accepted & contract signed successfully",
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

    if (
      !shipment.customer ||
      shipment.customer._id.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view these quotes",
      });
    }

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
    return res.status(500).json({
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

    if (
      !quote.shipment.customer ||
      quote.shipment.customer._id.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this quote",
      });
    }

    return res.status(200).json({
      success: true,
      quote,
    });
  } catch (error) {
    console.error("getQuoteById error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch quote details",
    });
  }
};
