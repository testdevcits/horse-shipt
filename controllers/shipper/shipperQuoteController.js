const { apiResponse } = require("../../responses/api.response");
const mongoose = require("mongoose");
const axios = require("axios");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const Shipper = require("../../models/shipper/shipperModel");
const { sendQuoteEmail } = require("../../utils/sendQuoteEmail");
const { sendQuoteSms } = require("../../utils/sendQuoteSms");
const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");
const generateContractPDF = require("../../utils/pdf/generateContractPDF");
const { emitToUser } = require("../../sockets/realtimeSocket");
const { sendAdminNotification } = require("../../utils/adminNotifications");

const sanitizePdfPublicId = (value = "document") => {
  const baseName = String(value)
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${baseName || "document"}.pdf`;
};

// ==========================================================
// SHIPPER CANCEL QUOTE / ASSIGNED SHIPMENT
// ==========================================================
const PlatformSettings = require("../../models/admin/payment/platformSettings");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const isAllowedDocumentUrl = (url = "") => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "res.cloudinary.com" ||
        parsed.hostname.endsWith(".cloudinary.com"))
    );
  } catch (error) {
    return false;
  }
};

const appendPdfExtension = (url = "") => {
  if (!url || /\.pdf($|\?)/i.test(url)) return null;
  const [baseUrl, query = ""] = String(url).split("?");
  return `${baseUrl}.pdf${query ? `?${query}` : ""}`;
};

const sendDocumentError = (res, status, message) =>
  res.status(status).type("html").send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Document unavailable</title></head>
  <body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#1f2937;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px">
    <div style="max-width:420px;border:1px solid #fecaca;background:#fff1f2;padding:18px;text-align:center">
      <h1 style="font-size:18px;margin:0 0 8px;color:#991b1b">Document unavailable</h1>
      <p style="font-size:14px;line-height:1.5;margin:0;color:#7f1d1d">${String(
        message || "Unable to load this document. Please try again."
      )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</p>
    </div>
  </body>
</html>`);

const getQuoteDocument = (quote, documentType) => {
  if (documentType === "generated") {
    return {
      url: quote.contract?.url,
      publicId: quote.contract?.public_id,
      filename: `Generated_Quote_Contract_${quote._id}.pdf`,
      contentType: "application/pdf",
    };
  }

  if (documentType === "shipper") {
    return {
      url: quote.shipperContract?.url,
      publicId: quote.shipperContract?.public_id,
      filename: quote.shipperContract?.originalName || "Shipper_Document.pdf",
      contentType: quote.shipperContract?.mimeType || "application/pdf",
    };
  }

  return null;
};

exports.streamQuoteDocument = async (req, res) => {
  try {
    const { quoteId, documentType } = req.params;
    const shipperId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(quoteId)) {
      return sendDocumentError(res, 400, "Invalid quote id");
    }

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return sendDocumentError(res, 404, apiResponse.QUOTE_NOT_FOUND);
    }

    if (quote.shipper?.toString() !== shipperId.toString()) {
      return sendDocumentError(res, 403, apiResponse.UNAUTHORIZED);
    }

    const document = getQuoteDocument(quote, documentType);

    if (!document?.url) {
      return sendDocumentError(res, 404, "Document not found");
    }

    const candidateUrls = [
      document.url,
      appendPdfExtension(document.url),
      document.publicId &&
        !String(document.publicId).toLowerCase().endsWith(".pdf") &&
        cloudinary.url(`${document.publicId}.pdf`, {
          resource_type: "raw",
          secure: true,
        }),
      document.publicId &&
        cloudinary.url(document.publicId, {
          resource_type: "raw",
          secure: true,
        }),
    ].filter(Boolean);

    if (!candidateUrls.some(isAllowedDocumentUrl)) {
      return sendDocumentError(res, 400, "Invalid document source");
    }

    let response = null;
    let lastError = null;

    for (const url of candidateUrls) {
      if (!isAllowedDocumentUrl(url)) continue;

      try {
        response = await axios.get(url, {
          responseType: "stream",
          timeout: 30000,
          validateStatus: (status) => status >= 200 && status < 300,
        });
        break;
      } catch (error) {
        lastError = error;
        console.warn("[SHIPPER QUOTE DOCUMENT STREAM RETRY]", {
          quoteId: quote._id.toString(),
          documentType,
          status: error.response?.status,
          message: error.message,
        });
      }
    }

    if (!response) throw lastError || new Error("Document source unavailable");

    res.setHeader("Content-Type", document.contentType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(document.filename).replace(/"/g, "")}"`
    );
    res.setHeader("Cache-Control", "private, max-age=300");

    response.data.pipe(res);
  } catch (error) {
    console.error("[SHIPPER QUOTE DOCUMENT STREAM ERROR]", error.message);
    return sendDocumentError(
      res,
      502,
      "Unable to load this document. Please try again."
    );
  }
};

exports.shipperCancelQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { quoteId } = req.body;

    const quote = await ShipmentQuote.findById(quoteId).populate("shipment");

    if (!quote) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.QUOTE_NOT_FOUND });
    }

    if (quote.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: apiResponse.CANNOT_CANCEL_QUOTE_NOT_ACCEPTED,
      });
    }

    if (quote.paymentStatus !== "paid" || !quote.stripePaymentIntentId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.PAYMENT_NOT_COMPLETED,
      });
    }

    const shipment = await CustomerShipment.findById(quote.shipment._id);

    if (
      quote.tripStatus === "completed" ||
      shipment?.status === "delivered" ||
      shipment?.status === "completed"
    ) {
      return res.status(400).json({
        success: false,
        message: "Completed shipment cannot be cancelled.",
      });
    }

    const shipper = await Shipper.findById(shipperId);

    if (!shipper?.stripeCustomerId || !shipper?.paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.CARD_NOT_AVAILABLE,
      });
    }

    // ---------------------- Fees ----------------------
    const settings = await PlatformSettings.findOne();

    const amountPaid = quote.totalPrice;
    const platformFee =
      (amountPaid * (settings?.platformFeePercent || 5)) / 100;

    const stripeFee = (amountPaid * 2.9) / 100 + 0.3;

    let cancellationFee = platformFee + stripeFee;

    if (cancellationFee < 0.5) cancellationFee = 0.5;

    const finalAmountInCents = Math.round(cancellationFee * 100);

    // ---------------------- Charge Shipper ----------------------
    let chargeIntent;

    try {
      chargeIntent = await stripe.paymentIntents.create({
        amount: finalAmountInCents,
        currency: settings?.currency || "usd",
        customer: shipper.stripeCustomerId,
        payment_method: shipper.paymentMethodId,
        off_session: true,
        confirm: true,

        metadata: {
          type: "shipper_cancellation_fee",
          quoteId: quote._id.toString(),
          shipmentId: shipment._id.toString(),
          shipperId: shipperId.toString(),
          amountPaid: amountPaid.toString(),
          cancellationFee: cancellationFee.toString(),
        },
      });
    } catch (err) {
      shipper.accountStatus = "RESTRICTED";
      shipper.lastPaymentFailure = new Date();
      shipper.paymentFailureReason = err.message;
      await shipper.save();

      return res.status(400).json({
        success: false,
        message: apiResponse.PAYMENT_FAILED_ACCOUNT_RESTRICTED,
      });
    }

    // ---------------------- Refund ----------------------
    let refund;

    try {
      refund = await stripe.refunds.create({
        payment_intent: quote.stripePaymentIntentId,
        amount: Math.round(amountPaid * 100),

        metadata: {
          type: "customer_refund",
          quoteId: quote._id.toString(),
          shipmentId: shipment._id.toString(),
          reason: "shipper_cancelled",
        },
      });

      if (refund.status !== "succeeded") {
        throw new Error("Refund failed");
      }
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: apiResponse.REFUND_FAILED,
      });
    }

    // ---------------------- DB UPDATE ----------------------
    quote.isCancelled = true;
    quote.cancelledAt = new Date();
    quote.cancelReason = "Cancelled by shipper";

    quote.refundAmount = amountPaid;
    quote.refundStatus = "processed";

    quote.cancellationChargeId = chargeIntent.id;
    quote.refundId = refund.id;
    quote.cancellationFee = cancellationFee;

    await quote.save();

    shipment.status = "cancelled";
    await shipment.save();

    emitToUser(req.app.get("io"), {
      role: "customer",
      userId: shipment.customer,
      event: "horse_shipt:quote_cancelled",
      payload: {
        quote,
        shipmentId: shipment._id,
        cancelledBy: "shipper",
      },
      notification: {
        type: "quote_cancelled",
        title: "Quote cancelled",
        message: apiResponse.A_SHIPPER_CANCELLED_AN_ACCEPTED_QUOTE,
      },
    });

    sendAdminNotification({
      title: "Quote cancelled by shipper",
      message: `${shipper.name || "A shipper"} cancelled an accepted quote for ${
        shipment.shipmentCode || "a shipment"
      }.`,
      event: "horse_shipt:quote_cancelled",
      type: "quote_cancelled",
      data: {
        quoteId: quote._id,
        shipmentId: shipment._id,
        shipmentCode: shipment.shipmentCode,
        shipperId,
        customerId: shipment.customer,
        cancelledBy: "shipper",
      },
    }).catch((error) =>
      console.error("[ADMIN NOTIFICATION] quote_cancelled failed:", error.message)
    );

    return res.status(200).json({
      success: true,
      message: apiResponse.CANCELLED_REFUNDED_AND_CHARGED,
      cancellationFee,
    });
  } catch (error) {
    console.error("[FATAL ERROR]", error);

    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_2,
      error: error.message,
    });
  }
};

exports.addQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;

    // ----------------- CHECK SHIPPER -----------------
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPPER_NOT_FOUND,
      });
    }

    if (shipper.accountStatus === "RESTRICTED") {
      return res.status(403).json({
        success: false,
        message:
          apiResponse.YOUR_ACCOUNT_IS_RESTRICTED_DUE_TO_PAYMENT_FAILURE_PLEASE_UPDATE_YOUR_CAR,
      });
    }

    // ----------------- GET BODY -----------------
    const {
      shipment,
      totalPrice,
      currency = "USD",
      paymentMethod,
      paymentDue,
      estimatedDeliveryDays,
      notes,
      shipperSignature,
      cancellationWindowDays,
    } = req.body;

    // ----------------- VALIDATION -----------------
    if (
      !shipment ||
      !totalPrice ||
      !paymentMethod ||
      !paymentDue ||
      !shipperSignature ||
      cancellationWindowDays === undefined ||
      cancellationWindowDays === null ||
      isNaN(Number(cancellationWindowDays))
    ) {
      return res.status(400).json({
        success: false,
        message:
          apiResponse.ALL_REQUIRED_FIELDS_INCLUDING_CANCELLATION_WINDOW_MUST_BE_PROVIDED,
      });
    }

    // ----------------- FETCH SHIPMENT -----------------
    const shipmentExists = await CustomerShipment.findById(shipment).populate(
      "customer"
    );

    if (!shipmentExists) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    // ----------------- PREVENT DUPLICATE -----------------
    const alreadyQuoted = await ShipmentQuote.findOne({
      shipment,
      shipper: shipperId,
      isActive: true,
    });

    if (alreadyQuoted) {
      return res.status(400).json({
        success: false,
        message:
          apiResponse.YOU_ALREADY_HAVE_AN_ACTIVE_QUOTE_FOR_THIS_SHIPMENT_IF_THE_CUSTOMER_REJEC,
      });
    }

    const staleCustomerQuote = await CustomerQuote.findOne({
      shipmentId: shipment,
      shipperId,
    }).lean();

    console.log("[QUOTE CREATE] CustomerQuote mirror check", {
      shipmentId: shipment.toString(),
      shipperId: shipperId.toString(),
      existingCustomerQuoteId: staleCustomerQuote?._id?.toString() || null,
      existingStatus: staleCustomerQuote?.status || null,
    });

    if (staleCustomerQuote?.status === "rejected") {
      const staleDeleteResult = await CustomerQuote.deleteMany({
        shipmentId: shipment,
        shipperId,
        status: "rejected",
      });

      console.log("[QUOTE RESEND] Removed rejected CustomerQuote mirror", {
        shipmentId: shipment.toString(),
        shipperId: shipperId.toString(),
        deletedCount: staleDeleteResult.deletedCount || 0,
      });
    } else if (staleCustomerQuote?.status === "accepted") {
      return res.status(400).json({
        success: false,
        message: apiResponse.ACCEPTED_QUOTE_CANNOT_BE_DELETED,
      });
    }

    // ================= CANCELLATION DATE =================
    const bookingDate = new Date();

    const cancellationLastDate = new Date(
      bookingDate.getTime() +
        Number(cancellationWindowDays) * 24 * 60 * 60 * 1000
    );

    // ----------------- GENERATE PDF -----------------
    const pdfBuffer = await generateContractPDF({
      shipment: shipmentExists,
      shipmentCode: shipmentExists.shipmentCode,
      customer: shipmentExists.customer,
      shipper: req.user,

      // vehicle removed
      vehicle: null,

      quote: {
        totalPrice,
        currency,
        paymentMethod,
        paymentDue,
        estimatedDeliveryDays,
        notes,
        cancellationWindowDays,
      },

      shipperSignature,
    });

    // ----------------- UPLOAD PDF -----------------
    const publicId = sanitizePdfPublicId(
      `${shipmentExists.shipmentCode}-${shipperId}`
    );

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: "shipment_contracts",
          public_id: publicId,
          overwrite: true,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );

      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });

    let shipperContract = null;

    if (req.file) {
      const contractUpload = await cloudinary.uploader.upload(req.file.path, {
        folder: "shipper_quote_contracts",
        resource_type: "raw",
        public_id: sanitizePdfPublicId(
          `${Date.now()}-${req.file.originalname || "shipper-document"}`
        ),
        overwrite: true,
      });

      shipperContract = {
        url: contractUpload.secure_url,
        public_id: contractUpload.public_id,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        uploadedAt: new Date(),
      };
    }

    // ----------------- CREATE QUOTE -----------------
    const quote = await ShipmentQuote.create({
      shipment,
      shipper: shipperId,

      // vehicle removed
      vehicle: null,

      totalPrice,
      currency,
      paymentMethod,
      paymentDue,
      estimatedDeliveryDays,
      notes,

      status: "pending",
      termsAccepted: false,

      contractId: new mongoose.Types.ObjectId().toString(),

      contract: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      },

      shipperContract,

      shipperSignature,
      customerSignature: null,
      contractAccepted: false,
      contractAcceptedAt: null,

      cancellationWindowDays: Number(cancellationWindowDays),
      cancellationLastDate,
    });

    console.log("[QUOTE CREATE] ShipmentQuote created", {
      quoteId: quote._id.toString(),
      shipmentId: shipment.toString(),
      shipperId: shipperId.toString(),
      status: quote.status,
    });

    // ----------------- NOTIFICATIONS -----------------
    let shipperSettings = await ShipperSettings.findOne({ shipperId });

    if (!shipperSettings) {
      shipperSettings = await ShipperSettings.create({ shipperId });
    }

    const canEmail = shipperSettings?.notifications?.quote?.email ?? true;
    const canSMS = shipperSettings?.notifications?.quote?.sms ?? true;

    // EMAIL
    if (canEmail) {
      try {
        await sendQuoteEmail(
          shipperId,
          "Quote Sent Successfully",
          {
            shipmentCode: shipmentExists.shipmentCode,
            totalPrice,
            currency,
            pickupLocation: shipmentExists.pickupLocation,
            deliveryLocation: shipmentExists.deliveryLocation,
            paymentMethod,
            paymentDue,
            customerName: shipmentExists.customer?.name,
          }
        );
      } catch (emailError) {
        console.error("[QUOTE MAIL ERROR]", emailError.message);
      }
    }

    // SMS
    if (canSMS) {
      try {
        await sendQuoteSms(shipperId, {
          shipment: shipmentExists,
          customer: shipmentExists.customer,
          totalPrice,
          currency,
        });
      } catch (smsError) {
        console.error("[QUOTE SMS ERROR]", smsError.message);
      }
    }

    emitToUser(req.app.get("io"), {
      role: "customer",
      userId: shipmentExists.customer._id,
      event: "horse_shipt:quote_created",
      payload: {
        quote,
        shipmentId: shipmentExists._id,
        shipmentCode: shipmentExists.shipmentCode,
        shipperName: shipper.name,
      },
      notification: {
        type: "quote_created",
        title: "New quote received",
        message: `${shipper.name || "A shipper"} submitted a quote for ${
          shipmentExists.shipmentCode || "your shipment"
        }`,
      },
    });

    sendAdminNotification({
      title: "New quote submitted",
      message: `${shipper.name || "A shipper"} submitted a quote for ${
        shipmentExists.shipmentCode || "a shipment"
      }.`,
      event: "horse_shipt:quote_created",
      type: "quote_created",
      data: {
        quoteId: quote._id,
        shipmentId: shipmentExists._id,
        shipmentCode: shipmentExists.shipmentCode,
        shipperId,
        customerId: shipmentExists.customer._id,
        amount: quote.totalPrice,
        currency: quote.currency,
      },
    }).catch((error) =>
      console.error("[ADMIN NOTIFICATION] quote_created failed:", error.message)
    );

    return res.status(201).json({
      success: true,
      message: apiResponse.QUOTE_SENT_SUCCESSFULLY,
      quote,
    });
  } catch (err) {
    console.error("[ADD QUOTE ERROR]:", err);

    if (err?.code === 11000) {
      console.error("[ADD QUOTE DUPLICATE KEY]", {
        keyPattern: err.keyPattern,
        keyValue: err.keyValue,
      });

      return res.status(409).json({
        success: false,
        message: "Unable to send a new quote. Please try again.",
        errors: {},
      });
    }

    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_SEND_QUOTE,
      errors: {},
    });
  }
};

exports.assignVehicleToQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { quoteId, vehicleId } = req.body;

    // ---------------- VALIDATION ----------------
    if (!quoteId || !vehicleId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.QUOTE_ID_AND_VEHICLE_ID_ARE_REQUIRED,
      });
    }

    // ---------------- FIND QUOTE ----------------
    const quote = await ShipmentQuote.findOne({
      _id: quoteId,
      shipper: shipperId,
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.QUOTE_NOT_FOUND_OR_DOES_NOT_BELONG_TO_YOU,
      });
    }

    // ---------------- CHECK STATUS ----------------
    if (quote.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: apiResponse.VEHICLE_CAN_ONLY_BE_ASSIGNED_AFTER_QUOTE_IS_ACCEPTED,
      });
    }

    // ---------------- FIND VEHICLE ----------------
    const vehicle = await ShipperVehicle.findOne({
      _id: vehicleId,
      shipper: shipperId,
    }).populate("driver");

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: apiResponse.VEHICLE_NOT_FOUND_OR_DOES_NOT_BELONG_TO_YOU,
      });
    }

    // ---------------- CHECK DRIVER ASSIGNED ----------------
    if (!vehicle.driver) {
      return res.status(400).json({
        success: false,
        message: apiResponse.PLEASE_ASSIGN_A_DRIVER_TO_THIS_VEHICLE_FIRST,
      });
    }

    // ---------------- CHECK VEHICLE BUSY ----------------
    if (vehicle.currentShipment) {
      return res.status(400).json({
        success: false,
        message:
          apiResponse.THIS_VEHICLE_IS_ALREADY_ASSIGNED_TO_AN_ACTIVE_SHIPMENT_COMPLETE_IT_FIRST,
      });
    }

    // ---------------- CHECK DRIVER BUSY ----------------
    const driverBusy = await ShipperVehicle.findOne({
      driver: vehicle.driver._id,
      currentShipment: { $ne: null },
    });

    if (driverBusy) {
      return res.status(400).json({
        success: false,
        message:
          apiResponse.THIS_DRIVER_IS_ALREADY_HANDLING_ANOTHER_SHIPMENT_PLEASE_COMPLETE_IT_FIRS,
      });
    }

    // ---------------- UPDATE QUOTE ----------------
    quote.vehicle = vehicleId;
    quote.assignedDriver = vehicle.driver._id; // 🔹 NEW: assign driver to the quote
    quote.transportType = vehicle.transportType || "";
    quote.stallsRequired = vehicle.numberOfStalls || 1;

    await quote.save();

    // ---------------- UPDATE VEHICLE ----------------
    vehicle.currentShipment = quote._id;
    vehicle.driverStatus = "BUSY";

    await vehicle.save();

    const shipmentForQuote = await CustomerShipment.findById(
      quote.shipment
    ).select("customer shipmentCode");

    emitToUser(req.app.get("io"), {
      role: "customer",
      userId: shipmentForQuote?.customer,
      event: "horse_shipt:quote_vehicle_assigned",
      payload: {
        quote,
        shipmentId: quote.shipment,
      },
      notification: {
        type: "vehicle_assigned",
        title: "Vehicle assigned",
        message: `Your shipper assigned a vehicle for ${
          shipmentForQuote?.shipmentCode || "your shipment"
        }.`,
      },
    });

    sendAdminNotification({
      title: "Vehicle assigned",
      message: `A vehicle was assigned for ${
        shipmentForQuote?.shipmentCode || "a shipment"
      }.`,
      event: "horse_shipt:quote_vehicle_assigned",
      type: "vehicle_assigned",
      data: {
        quoteId: quote._id,
        shipmentId: quote.shipment,
        shipmentCode: shipmentForQuote?.shipmentCode,
        shipperId,
        customerId: shipmentForQuote?.customer,
        vehicleId,
        driverId: vehicle.driver?._id,
      },
    }).catch((error) =>
      console.error(
        "[ADMIN NOTIFICATION] quote_vehicle_assigned failed:",
        error.message
      )
    );

    return res.status(200).json({
      success: true,
      message: apiResponse.VEHICLE_AND_DRIVER_ASSIGNED_SUCCESSFULLY,
      quote,
    });
  } catch (err) {
    console.error("[ASSIGN VEHICLE ERROR]:", err);

    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_ASSIGN_VEHICLE,
      error: err.message,
    });
  }
};

// ---------------- GET MY QUOTES ----------------
exports.getMyQuotes = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const quotes = await ShipmentQuote.find({ shipper: shipperId })
      .populate({
        path: "shipment",
        select:
          "pickupLocation deliveryLocation status pickupDate deliveryDate pickupDateRange deliveryDateRange numberOfHorses shipmentCode horses transportType estimatedDistance customer",
        populate: {
          path: "customer",
          select: "name email profileImage profilePicture",
        },
      })
      .populate({
        path: "vehicle",
        populate: {
          path: "driver",
          select: "name email phone profileImage driverStatus",
        },
      })
      .populate(
        "assignedDriver",
        "name email phone profileImage driverStatus currentLocation"
      )
      .populate("shipper", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: apiResponse.QUOTES_FETCHED_SUCCESSFULLY,
      quotes,
    });
  } catch (err) {
    console.error("[GET MY QUOTES ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_QUOTES,
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
      .json({ success: true, message: apiResponse.QUOTES_FETCHED_SUCCESSFULLY, quotes });
  } catch (err) {
    console.error("[GET QUOTES ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_QUOTES,
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
        message: apiResponse.NO_ACCEPTED_QUOTE_FOUND_FOR_THIS_SHIPMENT,
      });

    return res.status(200).json({ success: true, quote: acceptedQuote });
  } catch (error) {
    console.error("Get Accepted Quote Error:", error);
    return res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR });
  }
};

// ================= DELETE QUOTE =================
exports.deleteQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { quoteId } = req.params;

    // ---------------- VALIDATION ----------------
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.QUOTE_ID_IS_REQUIRED,
      });
    }

    // ---------------- FETCH QUOTE ----------------
    const quote = await ShipmentQuote.findById(quoteId).populate(
      "shipment",
      "customer shipmentCode"
    );

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.QUOTE_NOT_FOUND,
      });
    }

    // ---------------- AUTH CHECK ----------------
    if (quote.shipper.toString() !== shipperId.toString()) {
      return res.status(403).json({
        success: false,
        message: apiResponse.UNAUTHORIZED,
      });
    }

    // ---------------- BUSINESS RULES ----------------

    // Cannot delete accepted quote
    if (quote.status === "accepted") {
      return res.status(400).json({
        success: false,
        message: apiResponse.ACCEPTED_QUOTE_CANNOT_BE_DELETED,
      });
    }

    // Cannot delete cancelled quote (optional)
    if (quote.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: apiResponse.CANCELLED_QUOTE_CANNOT_BE_DELETED,
      });
    }

    // ---------------- DELETE CONTRACT FILE (Cloudinary) ----------------
    if (quote.contract?.public_id) {
      try {
        await cloudinary.uploader.destroy(quote.contract.public_id, {
          resource_type: "raw",
        });
      } catch (err) {
        console.error(
          "[DELETE QUOTE] Failed to delete contract file:",
          err.message
        );
      }
    }

    const quoteSnapshot = quote.toObject ? quote.toObject() : quote;
    const customerId = quote.shipment?.customer;
    const shipmentId = quote.shipment?._id || quote.shipment;

    // ---------------- DELETE QUOTE ----------------
    const deleteOperations = [
      ShipmentQuote.findByIdAndDelete(quoteId),
    ];

    if (shipmentId) {
      deleteOperations.push(
        CustomerQuote.deleteMany({
          shipmentId,
          shipperId,
        })
      );
    }

    await Promise.all(deleteOperations);

    emitToUser(req.app.get("io"), {
      role: "customer",
      userId: customerId,
      event: "horse_shipt:quote_cancelled",
      payload: {
        quote: {
          ...quoteSnapshot,
          status: "rejected",
          isDeleted: true,
          cancelReason: "Deleted by shipper",
        },
        quoteId,
        deleted: true,
        quoteStatus: "deleted",
        shipmentId,
        shipmentCode: quote.shipment?.shipmentCode,
        cancelledBy: "shipper",
      },
      notification: {
        type: "quote_cancelled",
        title: "Quote removed",
        message: `A shipper removed their quote for ${
          quote.shipment?.shipmentCode || "your shipment"
        }.`,
      },
    });

    sendAdminNotification({
      title: "Quote removed by shipper",
      message: `A shipper removed a quote for ${
        quote.shipment?.shipmentCode || "a shipment"
      }.`,
      event: "horse_shipt:quote_cancelled",
      type: "quote_cancelled",
      data: {
        quoteId,
        shipmentId,
        shipmentCode: quote.shipment?.shipmentCode,
        shipperId,
        customerId,
        cancelledBy: "shipper",
        deleted: true,
      },
    }).catch((error) =>
      console.error("[ADMIN NOTIFICATION] quote_deleted failed:", error.message)
    );

    // ---------------- RESPONSE ----------------
    return res.status(200).json({
      success: true,
      message: apiResponse.QUOTE_DELETED_SUCCESSFULLY,
    });
  } catch (error) {
    console.error("[DELETE QUOTE ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR_WHILE_DELETING_QUOTE,
      error: error.message,
    });
  }
};
