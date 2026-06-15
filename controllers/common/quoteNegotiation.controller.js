const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const QuoteNegotiation = require("../../models/shipper/QuoteNegotiation");
const { emitToUser } = require("../../sockets/realtimeSocket");

const getRole = (req) => req.user?.role;

const normalizeId = (value) => {
  if (!value) return "";
  return (value._id || value).toString();
};

const getQuoteForUser = async (quoteId, req) => {
  const role = getRole(req);
  const userId = req.user?._id?.toString();

  const quote = await ShipmentQuote.findById(quoteId)
    .populate({
      path: "shipment",
      select: "customer shipmentCode status pickupLocation deliveryLocation",
    })
    .populate("shipper", "name email companyName");

  if (!quote) {
    const error = new Error("Quote not found");
    error.statusCode = 404;
    throw error;
  }

  const customerId = normalizeId(quote.shipment?.customer);
  const shipperId = normalizeId(quote.shipper);
  const isCustomer = role === "customer" && customerId === userId;
  const isShipper = role === "shipper" && shipperId === userId;

  if (!isCustomer && !isShipper) {
    const error = new Error("Not authorized for this quote");
    error.statusCode = 403;
    throw error;
  }

  return { quote, role, userId, customerId, shipperId };
};

const ensureQuoteCanNegotiate = (quote) => {
  if (quote.status !== "pending" || quote.contractAccepted) {
    const error = new Error("Negotiation is locked after quote acceptance");
    error.statusCode = 400;
    throw error;
  }

  if (quote.paymentStatus === "paid") {
    const error = new Error("Negotiation is locked after payment");
    error.statusCode = 400;
    throw error;
  }
};

const getReceiver = ({ role, customerId, shipperId }) =>
  role === "customer"
    ? { role: "shipper", userId: shipperId }
    : { role: "customer", userId: customerId };

const emitNegotiationUpdate = ({
  req,
  receiver,
  event = "horse_shipt:quote_negotiation_updated",
  payload,
  notification,
}) => {
  emitToUser(req.app.get("io"), {
    role: receiver.role,
    userId: receiver.userId,
    event,
    payload,
    notification,
  });
};

const getHistoryPayload = async (quoteId) => {
  const negotiations = await QuoteNegotiation.find({ quote: quoteId })
    .sort({ createdAt: -1 })
    .lean();

  return {
    negotiations,
    latestNegotiation: negotiations[0] || null,
  };
};

exports.getQuoteNegotiations = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { quote } = await getQuoteForUser(quoteId, req);
    const history = await getHistoryPayload(quote._id);

    return res.json({
      success: true,
      quote,
      ...history,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch negotiation history",
    });
  }
};

exports.createNegotiation = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const amount = Number(req.body.amount);
    const reason = (req.body.reason || "").trim();
    const { quote, role, userId, customerId, shipperId } = await getQuoteForUser(
      quoteId,
      req
    );

    ensureQuoteCanNegotiate(quote);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid negotiation amount is required",
      });
    }

    await QuoteNegotiation.updateMany(
      { quote: quote._id, status: "pending" },
      {
        $set: {
          status: "countered",
          respondedByRole: role,
          respondedBy: userId,
          responseReason: "Counter offer submitted",
          respondedAt: new Date(),
        },
      }
    );

    const negotiation = await QuoteNegotiation.create({
      quote: quote._id,
      shipment: quote.shipment._id,
      customer: customerId,
      shipper: shipperId,
      proposedByRole: role,
      proposedBy: userId,
      amount,
      currency: quote.currency || "USD",
      reason,
      status: "pending",
    });

    if (quote.originalPrice === null || quote.originalPrice === undefined) {
      quote.originalPrice = quote.totalPrice;
    }
    quote.negotiatedPrice = amount;
    quote.negotiationStatus = "pending";
    quote.negotiationUpdatedAt = new Date();
    await quote.save();

    const payload = {
      quote,
      negotiation,
      shipmentId: quote.shipment._id,
      shipmentCode: quote.shipment.shipmentCode,
    };
    const receiver = getReceiver({ role, customerId, shipperId });

    emitNegotiationUpdate({
      req,
      receiver,
      payload,
      notification: {
        type: "quote_negotiation",
        title: "Quote negotiation update",
        message:
          role === "customer"
            ? "A customer sent a negotiated quote amount."
            : "A shipper sent a negotiated quote amount.",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Negotiation amount sent",
      quote,
      negotiation,
    });
  } catch (error) {
    console.error("createNegotiation error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to send negotiation amount",
    });
  }
};

exports.acceptNegotiation = async (req, res) => {
  try {
    const { negotiationId } = req.params;
    const negotiation = await QuoteNegotiation.findById(negotiationId);

    if (!negotiation) {
      return res.status(404).json({
        success: false,
        message: "Negotiation not found",
      });
    }

    const { quote, role, userId, customerId, shipperId } = await getQuoteForUser(
      negotiation.quote,
      req
    );

    ensureQuoteCanNegotiate(quote);

    if (negotiation.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending negotiations can be accepted",
      });
    }

    if (negotiation.proposedByRole === role) {
      return res.status(400).json({
        success: false,
        message: "The other party must accept this negotiation amount",
      });
    }

    negotiation.status = "confirmed";
    negotiation.respondedByRole = role;
    negotiation.respondedBy = userId;
    negotiation.responseReason = (req.body.reason || "").trim();
    negotiation.respondedAt = new Date();
    await negotiation.save();

    await QuoteNegotiation.updateMany(
      {
        quote: quote._id,
        _id: { $ne: negotiation._id },
        status: "pending",
      },
      { $set: { status: "superseded", respondedAt: new Date() } }
    );

    if (quote.originalPrice === null || quote.originalPrice === undefined) {
      quote.originalPrice = quote.totalPrice;
    }
    quote.totalPrice = negotiation.amount;
    quote.negotiatedPrice = negotiation.amount;
    quote.negotiationStatus = "confirmed";
    quote.negotiationConfirmedAt = new Date();
    quote.negotiationUpdatedAt = new Date();
    await quote.save();

    const payload = {
      quote,
      negotiation,
      shipmentId: quote.shipment._id,
      shipmentCode: quote.shipment.shipmentCode,
    };

    emitNegotiationUpdate({
      req,
      receiver: getReceiver({ role, customerId, shipperId }),
      payload,
      notification: {
        type: "quote_negotiation_confirmed",
        title: "Negotiated quote confirmed",
        message: `Negotiated amount confirmed at ${quote.currency || "USD"} ${
          negotiation.amount
        }.`,
      },
    });

    return res.json({
      success: true,
      message: "Negotiation confirmed and quote price updated",
      quote,
      negotiation,
    });
  } catch (error) {
    console.error("acceptNegotiation error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to accept negotiation",
    });
  }
};

exports.rejectNegotiation = async (req, res) => {
  try {
    const { negotiationId } = req.params;
    const negotiation = await QuoteNegotiation.findById(negotiationId);

    if (!negotiation) {
      return res.status(404).json({
        success: false,
        message: "Negotiation not found",
      });
    }

    const { quote, role, userId, customerId, shipperId } = await getQuoteForUser(
      negotiation.quote,
      req
    );

    ensureQuoteCanNegotiate(quote);

    if (negotiation.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending negotiations can be rejected",
      });
    }

    if (negotiation.proposedByRole === role) {
      return res.status(400).json({
        success: false,
        message: "The other party must reject this negotiation amount",
      });
    }

    negotiation.status = "rejected";
    negotiation.respondedByRole = role;
    negotiation.respondedBy = userId;
    negotiation.responseReason = (req.body.reason || "").trim();
    negotiation.respondedAt = new Date();
    await negotiation.save();

    const pendingCount = await QuoteNegotiation.countDocuments({
      quote: quote._id,
      status: "pending",
    });

    if (pendingCount === 0) {
      quote.negotiationStatus = "rejected";
      quote.negotiationUpdatedAt = new Date();
      await quote.save();
    }

    const payload = {
      quote,
      negotiation,
      shipmentId: quote.shipment._id,
      shipmentCode: quote.shipment.shipmentCode,
    };

    emitNegotiationUpdate({
      req,
      receiver: getReceiver({ role, customerId, shipperId }),
      payload,
      notification: {
        type: "quote_negotiation_rejected",
        title: "Negotiated quote rejected",
        message: "A negotiated quote amount was rejected.",
      },
    });

    return res.json({
      success: true,
      message: "Negotiation rejected",
      quote,
      negotiation,
    });
  } catch (error) {
    console.error("rejectNegotiation error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to reject negotiation",
    });
  }
};
