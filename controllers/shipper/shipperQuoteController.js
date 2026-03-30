const mongoose = require("mongoose");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const Shipper = require("../../models/shipper/shipperModel");
const { sendQuoteEmail } = require("../../utils/sendQuoteEmail");
const { sendQuoteSms } = require("../../utils/sendQuoteSms");
const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");
const generateContractPDF = require("../../utils/pdf/generateContractPDF");

// ==========================================================
// SHIPPER CANCEL QUOTE / ASSIGNED SHIPMENT
// ==========================================================
const PlatformSettings = require("../../models/admin/payment/platformSettings");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.shipperCancelQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { quoteId } = req.body;

    console.log("======================================");
    console.log("[SHIPPER CANCEL] Start", { shipperId, quoteId });

    const quote = await ShipmentQuote.findById(quoteId).populate("shipment");

    if (!quote) {
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });
    }

    if (quote.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel. Quote not accepted",
      });
    }

    if (quote.paymentStatus !== "paid" || !quote.stripePaymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment not completed",
      });
    }

    const shipment = await CustomerShipment.findById(quote.shipment._id);
    const shipper = await Shipper.findById(shipperId);

    if (!shipper?.stripeCustomerId || !shipper?.paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "Card not available",
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

      console.log("[SUCCESS] Charge:", chargeIntent.id);
    } catch (err) {
      shipper.accountStatus = "RESTRICTED";
      shipper.lastPaymentFailure = new Date();
      shipper.paymentFailureReason = err.message;
      await shipper.save();

      return res.status(400).json({
        success: false,
        message: "Payment failed. Account restricted.",
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

      console.log("[SUCCESS] Refund:", refund.id);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Refund failed",
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

    console.log("[COMPLETE] Done");

    return res.status(200).json({
      success: true,
      message: "Cancelled, refunded, and charged",
      cancellationFee,
    });
  } catch (error) {
    console.error("[FATAL ERROR]", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

exports.addQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;

    console.log("=====================================");
    console.log("[ADD QUOTE] Start", { shipperId });

    // ----------------- CHECK SHIPPER -----------------
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    if (shipper.accountStatus === "RESTRICTED") {
      return res.status(403).json({
        success: false,
        message:
          "Your account is restricted due to payment failure. Please update your card.",
      });
    }

    // ----------------- GET BODY -----------------
    const {
      shipment,
      totalPrice,
      currency = "USD",
      paymentMethod,
      paymentDue,
      pickupTime,
      estimatedArrivalTime,
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
      !pickupTime ||
      !estimatedArrivalTime ||
      !shipperSignature ||
      cancellationWindowDays === undefined ||
      cancellationWindowDays === null ||
      isNaN(Number(cancellationWindowDays))
    ) {
      console.log("[ERROR] Missing required fields", {
        cancellationWindowDays,
      });

      return res.status(400).json({
        success: false,
        message:
          "All required fields including cancellation window must be provided",
      });
    }

    // ----------------- FETCH SHIPMENT -----------------
    const shipmentExists = await CustomerShipment.findById(shipment).populate(
      "customer"
    );

    if (!shipmentExists) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ----------------- PREVENT DUPLICATE -----------------
    const alreadyQuoted = await ShipmentQuote.findOne({
      shipment,
      shipper: shipperId,
    });

    if (alreadyQuoted) {
      return res.status(400).json({
        success: false,
        message: "You already sent a quote for this shipment",
      });
    }

    // ================= CANCELLATION DATE =================
    const bookingDate = new Date();

    const cancellationLastDate = new Date(
      bookingDate.getTime() +
        Number(cancellationWindowDays) * 24 * 60 * 60 * 1000
    );

    console.log("[CANCELLATION]", {
      days: cancellationWindowDays,
      lastDate: cancellationLastDate,
    });

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
        pickupTime,
        estimatedArrivalTime,
        estimatedDeliveryDays,
        notes,
        cancellationWindowDays,
      },

      shipperSignature,
    });

    // ----------------- UPLOAD PDF -----------------
    const publicId = `shipment_contracts/${shipmentExists.shipmentCode}-${shipperId}`;

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: "shipment_contracts",
          public_id: publicId,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );

      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });

    console.log("[PDF UPLOADED]", uploadResult.secure_url);

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
      pickupTime,
      estimatedArrivalTime,
      estimatedDeliveryDays,
      notes,

      status: "pending",
      termsAccepted: false,

      contractId: new mongoose.Types.ObjectId().toString(),

      contract: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      },

      shipperSignature,
      customerSignature: null,
      contractAccepted: false,
      contractAcceptedAt: null,

      cancellationWindowDays: Number(cancellationWindowDays),
      cancellationLastDate,
    });

    console.log("[QUOTE CREATED]", quote._id);

    // ----------------- NOTIFICATIONS -----------------
    let shipperSettings = await ShipperSettings.findOne({ shipperId });

    if (!shipperSettings) {
      shipperSettings = await ShipperSettings.create({ shipperId });
    }

    const canEmail = shipperSettings?.notifications?.quote?.email ?? true;
    const canSMS = shipperSettings?.notifications?.quote?.sms ?? true;

    if (canEmail) {
      await sendQuoteEmail(
        shipperId,
        "Quote Sent Successfully",
        `Your quote for shipment ${shipment} has been sent successfully.`
      );
    }

    if (canSMS) {
      await sendQuoteSms(
        shipperId,
        `Quote sent successfully for shipment ${shipment}.`
      );
    }

    console.log("=====================================");

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

exports.assignVehicleToQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { quoteId, vehicleId } = req.body;

    console.log("=====================================");
    console.log("[ASSIGN VEHICLE]", { quoteId, vehicleId, shipperId });

    // ---------------- VALIDATION ----------------
    if (!quoteId || !vehicleId) {
      return res.status(400).json({
        success: false,
        message: "Quote ID and Vehicle ID are required",
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
        message: "Quote not found or not yours",
      });
    }

    // ---------------- CHECK VEHICLE ----------------
    const vehicle = await ShipperVehicle.findOne({
      _id: vehicleId,
      shipper: shipperId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found or does not belong to you",
      });
    }

    // ---------------- UPDATE QUOTE ----------------
    quote.vehicle = vehicleId;
    quote.transportType = vehicle.transportType || "";
    quote.stallsRequired = vehicle.numberOfStalls || 1;

    await quote.save();

    console.log("[VEHICLE ASSIGNED]", quote._id);

    return res.status(200).json({
      success: true,
      message: "Vehicle assigned successfully",
      quote,
    });
  } catch (err) {
    console.error("[ASSIGN VEHICLE ERROR]:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to assign vehicle",
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
      .populate("shipper", "name email")
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

// ================= DELETE QUOTE =================
exports.deleteQuote = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { quoteId } = req.params;

    console.log("[DELETE QUOTE] Start", { shipperId, quoteId });

    // ---------------- VALIDATION ----------------
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: "Quote ID is required",
      });
    }

    // ---------------- FETCH QUOTE ----------------
    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      console.log("[DELETE QUOTE] Quote not found:", quoteId);
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    // ---------------- AUTH CHECK ----------------
    if (quote.shipper.toString() !== shipperId.toString()) {
      console.log("[DELETE QUOTE] Unauthorized access", {
        quoteOwner: quote.shipper,
        shipperId,
      });
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ---------------- BUSINESS RULES ----------------

    // Cannot delete accepted quote
    if (quote.status === "accepted") {
      console.log("[DELETE QUOTE] Attempt to delete accepted quote");
      return res.status(400).json({
        success: false,
        message: "Accepted quote cannot be deleted",
      });
    }

    // Cannot delete cancelled quote (optional)
    if (quote.status === "cancelled") {
      console.log("[DELETE QUOTE] Attempt to delete cancelled quote");
      return res.status(400).json({
        success: false,
        message: "Cancelled quote cannot be deleted",
      });
    }

    // ---------------- DELETE CONTRACT FILE (Cloudinary) ----------------
    if (quote.contract?.public_id) {
      try {
        await cloudinary.uploader.destroy(quote.contract.public_id, {
          resource_type: "raw",
        });
        console.log("[DELETE QUOTE] Contract file deleted from cloudinary");
      } catch (err) {
        console.error(
          "[DELETE QUOTE] Failed to delete contract file:",
          err.message
        );
      }
    }

    // ---------------- DELETE QUOTE ----------------
    await ShipmentQuote.findByIdAndDelete(quoteId);

    console.log("[DELETE QUOTE] Success", quoteId);

    // ---------------- RESPONSE ----------------
    return res.status(200).json({
      success: true,
      message: "Quote deleted successfully",
    });
  } catch (error) {
    console.error("[DELETE QUOTE ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting quote",
      error: error.message,
    });
  }
};
