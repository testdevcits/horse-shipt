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
    console.log("[SHIPPER CANCEL] Start");
    console.log("Shipper:", shipperId);
    console.log("Quote:", quoteId);

    // ---------------------- Fetch Quote ----------------------
    const quote = await ShipmentQuote.findById(quoteId).populate("shipment");

    if (!quote) {
      console.log("[ERROR] Quote not found:", quoteId);
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });
    }

    console.log("[QUOTE]", {
      status: quote.status,
      shipmentId: quote.shipment?._id,
    });

    if (quote.status !== "accepted") {
      console.log("[ERROR] Quote not accepted:", quote.status);
      return res.status(400).json({
        success: false,
        message: "Cannot cancel. Quote not accepted",
      });
    }

    // ---------------------- Fetch Shipment ----------------------
    const shipment = await CustomerShipment.findById(quote.shipment._id);

    if (!shipment) {
      console.log("[ERROR] Shipment not found:", quote.shipment._id);
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    console.log("[SHIPMENT]", {
      id: shipment._id,
      totalAmount: shipment.totalAmount,
      paymentIntentId: shipment.paymentIntentId,
    });

    // ---------------------- Fetch Shipper ----------------------
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      console.log("[ERROR] Shipper not found:", shipperId);
      return res
        .status(404)
        .json({ success: false, message: "Shipper not found" });
    }

    if (!shipper.stripeCustomerId || !shipper.paymentMethodId) {
      console.log("[ERROR] Missing payment info", {
        stripeCustomerId: shipper.stripeCustomerId,
        paymentMethodId: shipper.paymentMethodId,
      });

      return res.status(400).json({
        success: false,
        message: "Shipper card not available",
      });
    }

    // ---------------------- Fee Calculation ----------------------
    const settings = await PlatformSettings.findOne();

    const platformFeePercent = settings?.platformFeePercent || 5;
    const platformFeeFlat = settings?.platformFeeFlat || 0;
    const currency = settings?.currency || "usd";

    const stripeFeePercent = 2.9;
    const stripeFeeFlat = 0.3;

    const amountPaid = shipment.totalAmount || 0;

    console.log("[FEES INPUT]", {
      amountPaid,
      platformFeePercent,
      platformFeeFlat,
      stripeFeePercent,
      stripeFeeFlat,
      currency,
    });

    const platformFee =
      (amountPaid * platformFeePercent) / 100 + platformFeeFlat;

    const stripeFee = (amountPaid * stripeFeePercent) / 100 + stripeFeeFlat;

    let cancellationFee = platformFee + stripeFee;

    console.log("[FEES CALCULATED]", {
      platformFee,
      stripeFee,
      cancellationFee,
    });

    // ---------------------- Minimum Charge Fix ----------------------
    if (currency === "usd" && cancellationFee < 0.5) {
      console.log("[INFO] Fee below Stripe minimum. Adjusting to $0.50");
      cancellationFee = 0.5;
    }

    const finalAmountInCents = Math.round(cancellationFee * 100);

    console.log("[FINAL CHARGE]", {
      cancellationFee,
      finalAmountInCents,
    });

    // ---------------------- Charge Shipper ----------------------
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: finalAmountInCents,
        currency,
        customer: shipper.stripeCustomerId,
        payment_method: shipper.paymentMethodId,
        off_session: true,
        confirm: true,
      });

      console.log("[SUCCESS] Shipper charged", paymentIntent.id);
    } catch (err) {
      console.error("[PAYMENT FAILED]", err.message);

      shipper.accountStatus = "RESTRICTED";
      shipper.lastPaymentFailure = new Date();
      shipper.paymentFailureReason = err.message;
      await shipper.save();

      return res.status(400).json({
        success: false,
        message: "Payment failed. Account restricted.",
        error: err.message,
      });
    }

    // ---------------------- Refund Customer ----------------------
    if (shipment.paymentIntentId) {
      console.log("[REFUND] Initiating refund...");

      const refund = await stripe.refunds.create({
        payment_intent: shipment.paymentIntentId,
        amount: Math.round(amountPaid * 100),
      });

      console.log("[REFUND RESULT]", refund);

      if (refund.status !== "succeeded") {
        console.error("[ERROR] Refund failed", refund);
        return res.status(500).json({
          success: false,
          message: "Refund failed",
        });
      }

      console.log("[SUCCESS] Customer refunded");
    }

    // ---------------------- Update DB ----------------------
    quote.status = "cancelled";
    quote.cancelledBy = "shipper";
    quote.cancelledAt = new Date();
    await quote.save();

    shipment.status = "cancelled";
    shipment.refundStatus = "completed";
    await shipment.save();

    console.log("[COMPLETE] Cancellation done", {
      quoteId,
      shipmentId: shipment._id,
    });

    console.log("======================================");

    return res.status(200).json({
      success: true,
      message: "Cancelled, refunded, and shipper charged",
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
      cancellationWindowDays,
    } = req.body;

    // ----------------- VALIDATION -----------------
    if (
      !shipment ||
      !vehicle ||
      !totalPrice ||
      !paymentMethod ||
      !pickupTime ||
      !estimatedArrivalTime ||
      !transportType ||
      !stallsRequired ||
      !shipperSignature ||
      cancellationWindowDays === undefined // ✅ NEW
    ) {
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

    // ----------------- FETCH VEHICLE -----------------
    const vehicleExists = await ShipperVehicle.findOne({
      _id: vehicle,
      shipper: shipperId,
    });

    if (!vehicleExists) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found or does not belong to you",
      });
    }

    // ----------------- PREVENT DUPLICATE QUOTE -----------------
    const alreadyQuoted = await ShipmentQuote.findOne({
      shipment,
      shipper: shipperId,
    });

    if (alreadyQuoted) {
      return res.status(400).json({
        success: false,
        message: "You have already sent a quote for this shipment",
      });
    }

    // ================= CANCELLATION DATE CALCULATION =================
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
      vehicle: vehicleExists,
      quote: {
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
        cancellationWindowDays, // optional include in PDF
      },
      shipperSignature,
    });

    // ----------------- GENERATE CONTRACT ID -----------------
    const contractId = new mongoose.Types.ObjectId();

    // ----------------- UPLOAD PDF TO CLOUDINARY -----------------
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

    // ----------------- CREATE QUOTE -----------------
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

      contractId,
      contract: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      },

      shipperSignature,
      customerSignature: null,
      contractAccepted: false,
      contractAcceptedAt: null,

      cancellationWindowDays,
      cancellationLastDate,
    });

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

    // ----------------- RESPONSE -----------------
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
