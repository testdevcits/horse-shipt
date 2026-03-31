const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../models/admin/payment/platformSettings");

const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");
const generateContractPDF = require("../../utils/pdf/generateContractPDF");

const Stripe = require("stripe");
const { notifyQuote } = require("../../utils/notifyQuote/notifyQuote");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================================================
   ACCEPT QUOTE (WITH PAYMENT + RECEIPT)
========================================================= */
// controllers/customer/customerQuoteController.js
exports.acceptQuoteWithSignature = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { customerSignature } = req.body;
    const customerId = req.user._id;

    console.log(
      "[DEBUG] acceptQuoteWithSignature called for quoteId:",
      quoteId
    );

    // ---------------- VALIDATION ----------------
    if (
      !customerSignature ||
      typeof customerSignature !== "string" ||
      !customerSignature.startsWith("data:image/")
    ) {
      console.log("[ERROR] Invalid customer signature");
      return res
        .status(400)
        .json({
          success: false,
          message: "Valid customer signature is required",
        });
    }

    // ---------------- FETCH QUOTE ----------------
    const quote = await ShipmentQuote.findById(quoteId)
      .populate({ path: "shipment", populate: { path: "customer" } })
      .populate("shipper")
      .populate("vehicle");

    if (!quote) {
      console.log("[ERROR] Quote not found:", quoteId);
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });
    }

    if (quote.contractAccepted) {
      console.log("[WARN] Quote already accepted:", quoteId);
      return res
        .status(400)
        .json({ success: false, message: "Quote already accepted" });
    }

    // ---------------- AUTH ----------------
    if (quote.shipment.customer._id.toString() !== customerId.toString()) {
      console.log("[ERROR] Customer not authorized for quote:", quoteId);
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (!quote.shipperSignature) {
      console.log("[ERROR] Shipper signature missing for quote:", quoteId);
      return res
        .status(400)
        .json({ success: false, message: "Shipper signature missing" });
    }

    // ---------------- PAYMENT VALIDATION ----------------
    if (quote.paymentMethod === "card" && quote.paymentStatus !== "paid") {
      if (!quote.stripePaymentIntentId) {
        console.log(
          "[ERROR] Stripe paymentIntentId missing for quote:",
          quoteId
        );
        return res
          .status(400)
          .json({
            success: false,
            message: "Payment must be completed before accepting quote",
          });
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(
        quote.stripePaymentIntentId
      );
      console.log("[DEBUG] Stripe payment status:", paymentIntent.status);

      if (paymentIntent.status === "succeeded") {
        quote.paymentStatus = "paid";
        await quote.save();
        console.log("[INFO] Payment marked as paid for quote:", quoteId);
      } else {
        console.log("[ERROR] Payment not completed for quote:", quoteId);
        return res
          .status(400)
          .json({
            success: false,
            message: "Payment must be completed before accepting quote",
          });
      }
    }

    // ---------------- GENERATE CONTRACT PDF ----------------
    console.log("[DEBUG] Generating contract PDF for quote:", quoteId);
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

    // ---------------- UPLOAD PDF ----------------
    console.log(
      "[DEBUG] Uploading contract PDF to Cloudinary for quote:",
      quoteId
    );
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          public_id: quote.contract?.public_id || `contracts/${quote._id}`,
          overwrite: true,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });
    console.log("[INFO] Contract PDF uploaded:", {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    });

    // ---------------- UPDATE QUOTE ----------------
    quote.customerSignature = customerSignature;
    quote.contract = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
    quote.contractAccepted = true;
    quote.contractAcceptedAt = new Date();
    quote.status = "accepted";
    await quote.save();
    console.log("[INFO] Quote updated with customer signature:", quoteId);

    // ---------------- REJECT OTHER QUOTES ----------------
    await ShipmentQuote.updateMany(
      { shipment: quote.shipment._id, _id: { $ne: quote._id } },
      { status: "rejected" }
    );
    console.log(
      "[INFO] Other quotes rejected for shipment:",
      quote.shipment._id
    );

    // ---------------- UPDATE SHIPMENT ----------------
    await CustomerShipment.findByIdAndUpdate(quote.shipment._id, {
      status: "assigned",
      assignedShipper: quote.shipper._id,
    });
    console.log(
      "[INFO] Shipment updated with assigned shipper:",
      quote.shipper._id
    );

    // ---------------- SAVE HISTORY ----------------
    await CustomerQuote.create({
      shipmentId: quote.shipment._id,
      customerId,
      shipperId: quote.shipper._id,
      price: quote.totalPrice,
      message: "Customer accepted quote",
      status: "accepted",
    });
    console.log("[INFO] Customer quote history saved");

    // ---------------- SEND NOTIFICATION (EMAIL + SMS) ----------------
    console.log("[DEBUG] Sending notification to shipper:", quote.shipper._id);
    try {
      await notifyQuote({
        shipperEmail: quote.shipper.email,
        shipperPhone: quote.shipper.mobile || "",
        customerName: quote.shipment.customer.name,
        shipment: quote.shipment,
        quote: { totalPrice: quote.totalPrice, currency: quote.currency },
      });
      console.log("[INFO] Notification sent successfully to shipper");
    } catch (notifyError) {
      console.error(
        "[ERROR] Notification failed but continuing:",
        notifyError.message
      );
    }

    // ---------------- RECEIPT ----------------
    const receipt = {
      shipmentPrice: quote.totalPrice,
      platformFee: 0,
      shipperReceives: quote.totalPrice,
      currency: quote.currency,
      note: "Full payment received. Platform fee will be deducted during payout.",
    };

    console.log("[SUCCESS] Quote accepted successfully:", quoteId);
    return res
      .status(200)
      .json({
        success: true,
        message: "Quote accepted & contract signed successfully",
        receipt,
        quote,
      });
  } catch (error) {
    console.error("acceptQuoteWithSignature error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to accept quote",
      });
  }
};

/* =========================================================
   GET ALL QUOTES BY SHIPMENT ID
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
   GET SINGLE QUOTE DETAIL
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

/* =========================================================
   CREATE STRIPE PAYMENT INTENT
========================================================= */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const customerId = req.user._id;
    const customerEmail = req.user.email;

    /* ---------------- FIND QUOTE ---------------- */
    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipment")
      .populate("shipper");

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    /* ---------------- AUTH CHECK ---------------- */
    if (quote.shipment.customer.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    /* ---------------- PREVENT DOUBLE PAYMENT ---------------- */
    if (quote.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment already completed for this quote",
      });
    }

    /* ---------------- CREATE PAYMENT INTENT ---------------- */
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(quote.totalPrice * 100), // cents
      currency: quote.currency || "usd",

      payment_method_types: ["card"],

      receipt_email: customerEmail,

      metadata: {
        quoteId: quote._id.toString(),
        shipmentId: quote.shipment._id.toString(),
        shipperId: quote.shipper._id.toString(),
        customerId: customerId.toString(),
        customerEmail: customerEmail,
      },
    });

    /* ---------------- SAVE PAYMENT DATA ---------------- */
    quote.stripePaymentIntentId = paymentIntent.id;
    quote.paymentStatus = "pending";

    await quote.save();

    /* ---------------- RESPONSE ---------------- */
    return res.status(200).json({
      success: true,
      message: "Payment intent created successfully",
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: quote.totalPrice,
      currency: quote.currency || "usd",
    });
  } catch (error) {
    console.error("createPaymentIntent error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment intent creation failed",
      error: error.message,
    });
  }
};

exports.cancelQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const customerId = req.user._id;

    console.log("Cancel Quote API called");
    console.log("QuoteId:", quoteId, "CustomerId:", customerId);

    /* ---------------- FIND QUOTE ---------------- */
    const quote = await ShipmentQuote.findById(quoteId).populate("shipment");

    if (!quote) {
      console.log("Quote not found");
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    console.log("Quote found:", {
      totalPrice: quote.totalPrice,
      status: quote.status,
      isCancelled: quote.isCancelled,
      paymentIntentId: quote.stripePaymentIntentId,
    });

    /* ---------------- AUTH CHECK ---------------- */
    if (quote.shipment.customer.toString() !== customerId.toString()) {
      console.log("Unauthorized access");
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    /* ---------------- ALREADY CANCELLED ---------------- */
    if (quote.isCancelled) {
      console.log("⚠️ Already cancelled");
      return res.status(400).json({
        success: false,
        message: "Quote already cancelled",
      });
    }

    const now = new Date();

    /* ---------------- CANCELLATION WINDOW CHECK ---------------- */
    if (quote.cancellationLastDate && now > quote.cancellationLastDate) {
      console.log("Cancellation window expired:", quote.cancellationLastDate);
      return res.status(400).json({
        success: false,
        message:
          "Cancellations are no longer available for this trip per the Shipper's policy.",
      });
    }

    /* ---------------- GET PLATFORM SETTINGS ---------------- */
    let settings = await PlatformSettings.findOne();

    if (!settings) {
      console.log("No settings found, using default");
      settings = {
        platformFeePercent: 5,
        platformFeeFlat: 0,
      };
    }

    console.log("⚙️ Platform Settings:", settings);

    /* ---------------- CALCULATE PLATFORM FEE ---------------- */
    const percentFee = (quote.totalPrice * settings.platformFeePercent) / 100;

    const flatFee = settings.platformFeeFlat || 0;

    const platformFee = percentFee + flatFee;

    const refundAmount = Math.max(quote.totalPrice - platformFee, 0);

    console.log("Fee Calculation:", {
      totalPrice: quote.totalPrice,
      percentFee,
      flatFee,
      platformFee,
      refundAmount,
    });

    let refundStatus = "not_required";

    /* ---------------- STRIPE HANDLING ---------------- */
    if (quote.stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          quote.stripePaymentIntentId
        );

        console.log("Stripe PaymentIntent:", {
          id: paymentIntent.id,
          status: paymentIntent.status,
        });

        /* -------- HOLD -------- */
        if (paymentIntent.status === "requires_capture") {
          console.log("Payment on HOLD → canceling intent");

          await stripe.paymentIntents.cancel(paymentIntent.id);

          refundStatus = "processed";
        } else if (paymentIntent.status === "succeeded") {
          /* -------- CAPTURED -------- */
          console.log("Payment CAPTURED → issuing refund");

          await stripe.refunds.create({
            payment_intent: paymentIntent.id,
            amount: Math.round(refundAmount * 100),
          });

          refundStatus = "processed";
        } else if (paymentIntent.status === "requires_payment_method") {
          /* -------- NOT PAID -------- */
          console.log("Payment not completed → no refund");
          refundStatus = "not_required";
        } else {
          console.log("⚠️ Unknown payment status:", paymentIntent.status);
          refundStatus = "pending";
        }
      } catch (err) {
        console.error("Stripe error:", err.message);
        refundStatus = "failed";
      }
    } else {
      console.log("No PaymentIntent found → no refund");
    }

    /* ---------------- UPDATE QUOTE ---------------- */
    quote.isCancelled = true;
    quote.cancelledAt = now;
    quote.refundAmount = refundAmount;
    quote.platformFee = platformFee;
    quote.refundStatus = refundStatus;
    quote.status = "rejected";

    await quote.save();

    console.log("Quote updated successfully");

    /* ---------------- RESPONSE ---------------- */
    return res.status(200).json({
      success: true,
      message: "Quote cancelled successfully",
      data: {
        totalAmount: quote.totalPrice,
        platformFee,
        refundAmount,
        refundStatus,
      },
    });
  } catch (error) {
    console.error("cancelQuote error:", error);

    return res.status(500).json({
      success: false,
      message: "Cancellation failed",
      error: error.message,
    });
  }
};
