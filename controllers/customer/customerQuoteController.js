// controllers/customer/customerQuoteController.js
const mongoose = require("mongoose");
const CustomerQuote = require("../../models/customer/CustomerQuoteModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const PlatformSettings = require("../../models/admin/payment/platformSettings");
const Shipper = require("../../models/shipper/shipperModel");

const cloudinary = require("../../utils/cloudinary");
const streamifier = require("streamifier");
const generateContractPDF = require("../../utils/pdf/generateContractPDF");

const Stripe = require("stripe");
const { notifyQuote } = require("../../utils/notifyQuote/notifyQuote");
const { emitToUser } = require("../../sockets/realtimeSocket");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================================================
   ACCEPT QUOTE (WITH PAYMENT + RECEIPT)
========================================================= */
exports.acceptQuoteWithSignature = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { quoteId } = req.params;
    const { customerSignature } = req.body;
    const customerId = req.user._id;

    // ---------------- VALIDATION ----------------
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

    // ---------------- FETCH QUOTE ----------------
    const quote = await ShipmentQuote.findById(quoteId)
      .populate({ path: "shipment", populate: { path: "customer" } })
      .populate("shipper")
      .populate("vehicle")
      .session(session);

    if (!quote) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Quote not found" });
    }

    if (quote.contractAccepted) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Quote already accepted" });
    }

    // ---------------- AUTH ----------------
    if (quote.shipment.customer._id.toString() !== customerId.toString()) {
      await session.abortTransaction();
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (!quote.shipperSignature) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Shipper signature missing" });
    }

    // ---------------- PAYMENT VALIDATION ----------------
    if (quote.paymentMethod === "card" && quote.paymentStatus !== "paid") {
      if (!quote.stripePaymentIntentId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Payment must be completed before accepting quote",
        });
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(
        quote.stripePaymentIntentId
      );

      if (paymentIntent.status === "succeeded") {
        quote.paymentStatus = "paid";
      } else {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ success: false, message: "Payment not completed" });
      }
    }

    // ---------------- GENERATE PDF ----------------
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
        estimatedDeliveryDays: quote.estimatedDeliveryDays,
        transportType: quote.transportType,
        stallsRequired: quote.stallsRequired,
        notes: quote.notes,
      },
      shipperSignature: quote.shipperSignature,
      customerSignature,
    });

    // ---------------- UPLOAD PDF ----------------
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

    // ---------------- UPDATE QUOTE ----------------
    quote.customerSignature = customerSignature;
    quote.contract = {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
    quote.contractAccepted = true;
    quote.contractAcceptedAt = new Date();
    quote.status = "accepted";

    await quote.save({ session });

    // ---------------- REJECT OTHER QUOTES ----------------
    await ShipmentQuote.updateMany(
      { shipment: quote.shipment._id, _id: { $ne: quote._id } },
      { status: "rejected" },
      { session }
    );

    // ---------------- UPDATE SHIPMENT ----------------
    await CustomerShipment.findByIdAndUpdate(
      quote.shipment._id,
      {
        status: "assigned",
        shipper: quote.shipper._id,
        assignedShipper: quote.shipper._id,
      },
      { new: true, session }
    );

    // ---------------- SAVE HISTORY ----------------
    await CustomerQuote.create(
      [
        {
          shipmentId: quote.shipment._id,
          customerId,
          shipperId: quote.shipper._id,
          price: quote.totalPrice,
          message: "Customer accepted quote",
          status: "accepted",
        },
      ],
      { session }
    );

    // COMMIT TRANSACTION
    await session.commitTransaction();
    session.endSession();

    // ---------------- NOTIFICATIONS ----------------
    const shipperEmail = quote.shipper?.email;
    const shipperPhone = quote.shipper?.mobile || quote.shipper?.phone;

    if (shipperEmail || shipperPhone) {
      try {
        await notifyQuote({
          shipperEmail,
          shipperPhone,
          customerName: quote.shipment.customer.name,
          shipment: quote.shipment,
          quote: {
            totalPrice: quote.totalPrice,
            currency: quote.currency,
          },
        });
      } catch (err) {
        console.error("[ERROR] Notification failed:", err.message);
      }
    }

    emitToUser(req.app.get("io"), {
      role: "shipper",
      userId: quote.shipper._id,
      event: "horse_shipt:quote_accepted",
      payload: {
        quote,
        shipmentId: quote.shipment._id,
        shipmentCode: quote.shipment.shipmentCode,
      },
      notification: {
        type: "quote_accepted",
        title: "Quote accepted",
        message: `${quote.shipment.customer.name || "A customer"} accepted your quote.`,
      },
    });

    emitToUser(req.app.get("io"), {
      role: "customer",
      userId: customerId,
      event: "horse_shipt:quote_accepted",
      payload: {
        quote,
        shipmentId: quote.shipment._id,
        shipmentCode: quote.shipment.shipmentCode,
      },
    });

    // ---------------- RESPONSE ----------------
    return res.status(200).json({
      success: true,
      message: "Quote accepted & contract signed successfully",
      receipt: {
        shipmentPrice: quote.totalPrice,
        platformFee: 0,
        shipperReceives: quote.totalPrice,
        currency: quote.currency,
        note: "Full payment received. Platform fee deducted during payout.",
      },
      quote,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("acceptQuoteWithSignature error:", error);

    return res.status(500).json({
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

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

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

    // Total count
    const totalQuotes = await ShipmentQuote.countDocuments({
      shipment: shipmentId,
    });

    // Paginated data
    const quotes = await ShipmentQuote.find({ shipment: shipmentId })
      .populate("shipper", "name email phone companyName")
      .populate("vehicle")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      shipmentId,
      totalQuotes,
      currentPage: page,
      totalPages: Math.ceil(totalQuotes / limit),
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

    /* ---------------- FIND QUOTE ---------------- */
    const quote = await ShipmentQuote.findById(quoteId).populate("shipment");

    if (!quote) {
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
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    /* ---------------- ALREADY CANCELLED ---------------- */
    if (quote.isCancelled) {
      return res.status(400).json({
        success: false,
        message: "Quote already cancelled",
      });
    }

    const now = new Date();

    /* ---------------- CANCELLATION WINDOW CHECK ---------------- */
    if (quote.cancellationLastDate && now > quote.cancellationLastDate) {
      return res.status(400).json({
        success: false,
        message:
          "Cancellations are no longer available for this trip per the Shipper's policy.",
      });
    }

    /* ---------------- GET PLATFORM SETTINGS ---------------- */
    let settings = await PlatformSettings.findOne();

    if (!settings) {
      settings = {
        platformFeePercent: 5,
        platformFeeFlat: 0,
      };
    }

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

          await stripe.paymentIntents.cancel(paymentIntent.id);

          refundStatus = "processed";
        } else if (paymentIntent.status === "succeeded") {
          /* -------- CAPTURED -------- */

          await stripe.refunds.create({
            payment_intent: paymentIntent.id,
            amount: Math.round(refundAmount * 100),
          });

          refundStatus = "processed";
        } else if (paymentIntent.status === "requires_payment_method") {
          /* -------- NOT PAID -------- */
          refundStatus = "not_required";
        } else {
          refundStatus = "pending";
        }
      } catch (err) {
        console.error("Stripe error:", err.message);
        refundStatus = "failed";
      }
    } else {
    }

    /* ---------------- UPDATE QUOTE ---------------- */
    quote.isCancelled = true;
    quote.cancelledAt = now;
    quote.refundAmount = refundAmount;
    quote.platformFee = platformFee;
    quote.refundStatus = refundStatus;
    quote.status = "rejected";

    await quote.save();

    emitToUser(req.app.get("io"), {
      role: "shipper",
      userId: quote.shipper,
      event: "horse_shipt:quote_cancelled",
      payload: {
        quote,
        shipmentId: quote.shipment._id,
        cancelledBy: "customer",
      },
      notification: {
        type: "quote_cancelled",
        title: "Quote cancelled",
        message: "A customer cancelled a quote.",
      },
    });

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

exports.getCustomerStripePayments = async (req, res) => {
  try {
    const customerEmail = req.user.email;

    // ---------------- GET STRIPE CHARGES ----------------
    const charges = await stripe.charges.list({
      limit: 20,
    });

    // ---------------- FILTER CUSTOMER PAYMENTS ----------------
    const customerCharges = charges.data.filter(
      (charge) =>
        charge.billing_details?.email === customerEmail ||
        charge.metadata?.customerEmail === customerEmail
    );

    // ---------------- GET UNIQUE IDS ----------------
    const shipperIds = [
      ...new Set(
        customerCharges.map((c) => c.metadata?.shipperId).filter(Boolean)
      ),
    ];

    const quoteIds = [
      ...new Set(
        customerCharges.map((c) => c.metadata?.quoteId).filter(Boolean)
      ),
    ];

    // ---------------- FETCH SHIPPERS (WITH IMAGE) ----------------
    const shippers = await Shipper.find({
      _id: { $in: shipperIds },
    }).select("name email mobile profileImage");

    const shipperMap = {};
    shippers.forEach((s) => {
      shipperMap[s._id.toString()] = {
        name: s.name,
        email: s.email,
        mobile: s.mobile,
        profileImage: s.profileImage?.url || null,
      };
    });

    // ---------------- FETCH QUOTES + SHIPMENT ----------------
    const quotes = await ShipmentQuote.find({
      _id: { $in: quoteIds },
    })
      .populate({
        path: "shipment",
        select: "pickupLocation deliveryLocation origin destination",
      })
      .select("shipment");

    const quoteMap = {};
    quotes.forEach((q) => {
      quoteMap[q._id.toString()] = q;
    });

    // ---------------- FORMAT RESPONSE ----------------
    const formatted = customerCharges.map((charge) => {
      const createdDate = new Date(charge.created * 1000);

      const metadata = charge.metadata || {};
      const quote = quoteMap[metadata.quoteId];
      const shipment = quote?.shipment;

      const shipper = shipperMap[metadata.shipperId] || {};

      return {
        transactionId: charge.id,

        amount: charge.amount / 100,
        currency: charge.currency,

        status: charge.status,
        paid: charge.paid,

        receiptUrl: charge.receipt_url,

        createdAt: createdDate,

        paymentDate: createdDate.toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),

        paymentTime: createdDate.toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),

        paymentDateTime: createdDate.toLocaleString("en-US", {
          timeZone: "America/New_York",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),

        // ---------------- SHIPPER WITH IMAGE ----------------
        shipper: {
          id: metadata.shipperId,
          name: shipper.name || "Unknown Shipper",
          email: shipper.email || "N/A",
          mobile: shipper.mobile || "N/A",
          profileImage: shipper.profileImage || null,
        },

        // ---------------- CUSTOMER ----------------
        customerEmail:
          charge.billing_details?.email || metadata.customerEmail || null,

        customerName:
          charge.billing_details?.name || metadata.customerName || "N/A",

        // ---------------- CARD ----------------
        paymentMethod: charge.payment_method_details?.type,
        cardBrand: charge.payment_method_details?.card?.brand,
        last4: charge.payment_method_details?.card?.last4,

        // ---------------- SHIPMENT ----------------
        pickupLocation: shipment?.pickupLocation || shipment?.origin || "N/A",

        deliveryLocation:
          shipment?.deliveryLocation || shipment?.destination || "N/A",
      };
    });

    // ---------------- RESPONSE ----------------
    return res.status(200).json({
      success: true,
      total: formatted.length,
      payments: formatted,
    });
  } catch (error) {
    console.error("Stripe payments error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
};
