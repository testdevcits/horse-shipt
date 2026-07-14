const { apiResponse } = require("../../responses/api.response");
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
const {
  getShipperChannelSettings,
} = require("../../utils/notificationPreferences");
const { successResponse, errorResponse } = require("../../utils/responseHandler");
const {
  customerQuoteResponse,
  authResponse,
  generalResponse,
} = require("../../responses");
const { sendAdminNotification } = require("../../utils/adminNotifications");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const destroyQuoteAsset = async (asset) => {
  if (!asset?.public_id) return;

  for (const resource_type of ["raw", "image"]) {
    try {
      await cloudinary.uploader.destroy(asset.public_id, { resource_type });
      return;
    } catch (error) {
      console.warn("[QUOTE CLEANUP] Failed to destroy quote asset", {
        publicId: asset.public_id,
        resource_type,
        message: error.message,
      });
    }
  }
};

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
      return errorResponse(res, 400, customerQuoteResponse.SIGNATURE_REQUIRED);
    }

    // ---------------- FETCH QUOTE ----------------
    const quote = await ShipmentQuote.findById(quoteId)
      .populate({ path: "shipment", populate: { path: "customer" } })
      .populate("shipper")
      .populate("vehicle")
      .session(session);

    if (!quote) {
      await session.abortTransaction();
      return errorResponse(res, 404, customerQuoteResponse.NOT_FOUND);
    }

    if (quote.contractAccepted) {
      await session.abortTransaction();
      return errorResponse(res, 400, customerQuoteResponse.ALREADY_ACCEPTED);
    }

    // ---------------- AUTH ----------------
    if (quote.shipment.customer._id.toString() !== customerId.toString()) {
      await session.abortTransaction();
      return errorResponse(res, 403, authResponse.UNAUTHORIZED);
    }

    if (!quote.shipperSignature) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        customerQuoteResponse.SHIPPER_SIGNATURE_MISSING
      );
    }

    // ---------------- PAYMENT VALIDATION ----------------
    if (quote.paymentMethod === "card" && quote.paymentStatus !== "paid") {
      if (!quote.stripePaymentIntentId) {
        await session.abortTransaction();
        return errorResponse(res, 400, customerQuoteResponse.PAYMENT_REQUIRED);
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(
        quote.stripePaymentIntentId
      );

      if (paymentIntent.status === "succeeded") {
        quote.paymentStatus = "paid";
      } else {
        await session.abortTransaction();
        return errorResponse(
          res,
          400,
          customerQuoteResponse.PAYMENT_NOT_COMPLETED
        );
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
      { status: "rejected", isActive: false },
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

    // ---------------- SAVE CURRENT CUSTOMER QUOTE MIRROR ----------------
    const acceptedMirror = await CustomerQuote.findOneAndUpdate(
      {
        shipmentId: quote.shipment._id,
        shipperId: quote.shipper._id,
      },
      {
        $set: {
          shipmentId: quote.shipment._id,
          customerId,
          shipperId: quote.shipper._id,
          price: quote.totalPrice,
          message: apiResponse.CUSTOMER_ACCEPTED_QUOTE,
          status: "accepted",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );

    console.log("[QUOTE ACCEPT] CustomerQuote mirror saved", {
      customerQuoteId: acceptedMirror?._id?.toString(),
      quoteId: quote._id.toString(),
      shipmentId: quote.shipment._id.toString(),
      shipperId: quote.shipper._id.toString(),
      customerId: customerId.toString(),
      status: acceptedMirror?.status,
    });

    // COMMIT TRANSACTION
    await session.commitTransaction();
    session.endSession();

    // ---------------- NOTIFICATIONS ----------------
    const shipperEmail = quote.shipper?.email;
    const shipperPhone = quote.shipper?.mobile || quote.shipper?.phone;
    const quoteNotificationSettings = await getShipperChannelSettings(
      quote.shipper._id,
      "quote"
    );

    if (
      (quoteNotificationSettings.email && shipperEmail) ||
      (quoteNotificationSettings.sms && shipperPhone)
    ) {
      try {
        await notifyQuote({
          shipperEmail: quoteNotificationSettings.email ? shipperEmail : null,
          shipperPhone: quoteNotificationSettings.sms ? shipperPhone : null,
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

    sendAdminNotification({
      title: "Quote accepted",
      message: `${quote.shipment.customer.name || "A customer"} accepted a quote for shipment ${
        quote.shipment.shipmentCode || quote.shipment._id
      }.`,
      event: "horse_shipt:quote_accepted",
      type: "quote_accepted",
      data: {
        quoteId: quote._id,
        shipmentId: quote.shipment._id,
        shipmentCode: quote.shipment.shipmentCode,
        customerId,
        shipperId: quote.shipper._id,
        amount: quote.totalPrice,
        currency: quote.currency,
      },
    }).catch((error) =>
      console.error("[ADMIN NOTIFICATION] quote_accepted failed:", error.message)
    );

    // ---------------- RESPONSE ----------------
    const receipt = {
        shipmentPrice: quote.totalPrice,
        platformFee: 0,
        shipperReceives: quote.totalPrice,
        currency: quote.currency,
        note: "Full payment received. Platform fee deducted during payout.",
      };

    return successResponse(
      res,
      200,
      customerQuoteResponse.ACCEPTED,
      { receipt, quote },
      { receipt, quote }
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("acceptQuoteWithSignature error:", error);

    return errorResponse(
      res,
      500,
      generalResponse.SOMETHING_WENT_WRONG,
      {}
    );
  }
};

exports.rejectQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const customerId = req.user._id;
    const reason = (req.body?.reason || "").trim();

    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipment")
      .populate("shipper", "name email companyName");

    if (!quote) {
      return errorResponse(res, 404, customerQuoteResponse.NOT_FOUND);
    }

    if (quote.shipment.customer.toString() !== customerId.toString()) {
      return errorResponse(res, 403, authResponse.UNAUTHORIZED);
    }

    if (quote.status === "accepted" || quote.contractAccepted) {
      return errorResponse(
        res,
        400,
        customerQuoteResponse.ACCEPTED_REJECT_BLOCKED
      );
    }

    if (quote.status === "rejected") {
      return errorResponse(res, 400, customerQuoteResponse.ALREADY_REJECTED);
    }

    if (quote.paymentStatus === "paid") {
      return errorResponse(
        res,
        400,
        customerQuoteResponse.PAID_REJECT_BLOCKED
      );
    }

    const quoteSnapshot = quote.toObject ? quote.toObject() : quote;
    const shipperId = quote.shipper._id || quote.shipper;
    const shipmentId = quote.shipment._id;
    const cancelReason = reason || "Rejected by customer";

    if (quote.stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          quote.stripePaymentIntentId
        );

        if (paymentIntent.status === "succeeded") {
          return errorResponse(
            res,
            400,
            customerQuoteResponse.PAID_REJECT_BLOCKED
          );
        }

        if (
          [
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
            "processing",
            "requires_capture",
          ].includes(paymentIntent.status)
        ) {
          await stripe.paymentIntents.cancel(paymentIntent.id);
        }
      } catch (error) {
        console.warn("[QUOTE REJECT] Stripe payment intent cleanup skipped", {
          quoteId: quote._id.toString(),
          paymentIntentId: quote.stripePaymentIntentId,
          message: error.message,
        });
      }
    }

    const [quoteDeleteResult, mirrorDeleteResult] = await Promise.all([
      ShipmentQuote.deleteOne({
        _id: quote._id,
        paymentStatus: { $ne: "paid" },
      }),
      CustomerQuote.deleteMany({
        shipmentId,
        shipperId,
      }),
    ]);

    if (!quoteDeleteResult.deletedCount) {
      return errorResponse(
        res,
        400,
        "Unable to reject quote. Please try again.",
        {}
      );
    }

    await Promise.all([
      destroyQuoteAsset(quote.contract),
      destroyQuoteAsset(quote.shipperContract),
    ]);

    console.log("[QUOTE REJECT] Deleted rejected quote everywhere", {
      quoteId: quote._id.toString(),
      shipmentId: shipmentId.toString(),
      shipperId: shipperId.toString(),
      customerId: customerId.toString(),
      mirrorDeletedCount: mirrorDeleteResult.deletedCount || 0,
    });

    const [remainingQuote, remainingMirror] = await Promise.all([
      ShipmentQuote.findById(quote._id).lean(),
      CustomerQuote.findOne({ shipmentId, shipperId }).lean(),
    ]);

    if (remainingQuote || remainingMirror) {
      console.error("[QUOTE REJECT] Rejected quote cleanup incomplete", {
        quoteId: quote._id.toString(),
        remainingQuoteId: remainingQuote?._id?.toString() || null,
        remainingMirrorId: remainingMirror?._id?.toString() || null,
        shipmentId,
        shipperId,
      });
      return errorResponse(
        res,
        500,
        "Unable to reject quote. Please try again.",
        {}
      );
    }

    emitToUser(req.app.get("io"), {
      role: "shipper",
      userId: shipperId,
      event: "horse_shipt:quote_rejected",
      payload: {
        quote: {
          ...quoteSnapshot,
          status: "rejected",
          isDeleted: true,
          cancelReason,
        },
        quoteId: quote._id,
        deleted: true,
        quoteStatus: "deleted",
        reason: cancelReason,
        shipmentCode: quote.shipment.shipmentCode,
      },
      notification: {
        type: "quote_rejected",
        title: "Quote Rejected",
        message:
          "Your quote was rejected by the customer and has been removed. You can send a new quote now.",
      },
    });

    return successResponse(
      res,
      200,
      customerQuoteResponse.REJECTED,
      { quoteId: quote._id, deleted: true },
      { quoteId: quote._id, deleted: true }
    );
  } catch (error) {
    console.error("rejectQuote error:", error);
    return errorResponse(
      res,
      500,
      generalResponse.SOMETHING_WENT_WRONG,
      {}
    );
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
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    if (
      !shipment.customer ||
      shipment.customer._id.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: apiResponse.NOT_AUTHORIZED_TO_VIEW_THESE_QUOTES,
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
      message: apiResponse.FAILED_TO_FETCH_QUOTES,
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
        message: "This quote is no longer available.",
      });
    }

    if (
      !quote.shipment.customer ||
      quote.shipment.customer._id.toString() !== customerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: apiResponse.NOT_AUTHORIZED_TO_VIEW_THIS_QUOTE,
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
      message: apiResponse.FAILED_TO_FETCH_QUOTE_DETAILS,
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
        message: apiResponse.QUOTE_NOT_FOUND,
      });
    }

    /* ---------------- AUTH CHECK ---------------- */
    if (quote.shipment.customer.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: apiResponse.UNAUTHORIZED,
      });
    }

    if (
      quote.status !== "pending" ||
      quote.contractAccepted === true ||
      quote.isCancelled ||
      quote.isActive === false
    ) {
      return res.status(400).json({
        success: false,
        message: "This quote is no longer available.",
      });
    }

    /* ---------------- PREVENT DOUBLE PAYMENT ---------------- */
    if (quote.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: apiResponse.PAYMENT_ALREADY_COMPLETED_FOR_THIS_QUOTE,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(quote.totalPrice * 100), // cents
      currency: quote.currency || "usd",

      payment_method_types: ["card"],
      transfer_group: `quote_${quote._id.toString()}`,

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
      message: apiResponse.PAYMENT_INTENT_CREATED_SUCCESSFULLY,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: quote.totalPrice,
      currency: quote.currency || "usd",
    });
  } catch (error) {
    console.error("createPaymentIntent error:", error);

    return res.status(500).json({
      success: false,
      message: apiResponse.PAYMENT_INTENT_CREATION_FAILED,
      errors: {},
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
        message: apiResponse.QUOTE_NOT_FOUND,
      });
    }

    /* ---------------- AUTH CHECK ---------------- */
    if (quote.shipment.customer.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: apiResponse.UNAUTHORIZED,
      });
    }

    /* ---------------- ALREADY CANCELLED ---------------- */
    if (quote.isCancelled) {
      return res.status(400).json({
        success: false,
        message: apiResponse.QUOTE_ALREADY_CANCELLED,
      });
    }

    const now = new Date();

    /* ---------------- CANCELLATION WINDOW CHECK ---------------- */
    if (quote.cancellationLastDate && now > quote.cancellationLastDate) {
      return res.status(400).json({
        success: false,
        message:
          apiResponse.CANCELLATIONS_ARE_NO_LONGER_AVAILABLE_FOR_THIS_TRIP_PER_THE_SHIPPER_S_PO,
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

    let refundStatus = "not_required";

    /* ---------------- STRIPE HANDLING ---------------- */
    if (quote.stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          quote.stripePaymentIntentId
        );

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
        message: apiResponse.A_CUSTOMER_CANCELLED_A_QUOTE,
      },
    });

    /* ---------------- RESPONSE ---------------- */
    return res.status(200).json({
      success: true,
      message: apiResponse.QUOTE_CANCELLED_SUCCESSFULLY,
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
      message: apiResponse.CANCELLATION_FAILED,
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
      message: apiResponse.FAILED_TO_FETCH_TRANSACTIONS,
      error: error.message,
    });
  }
};
