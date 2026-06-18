const { apiResponse } = require("../../responses/api.response");
const CustomerReview = require("../../models/customer/customerReview.model");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const Shipper = require("../../models/shipper/shipperModel");

const isValidRating = (rating) => Number(rating) >= 1 && Number(rating) <= 5;

exports.addCustomerReview = async (req, res) => {
  try {
    const shipperId = req.user._id || req.user.id;
    const { customerId, shipmentId, rating, reviewText = "" } = req.body;

    if (!customerId || !shipmentId || !rating) {
      return res.status(400).json({
        success: false,
        message: apiResponse.CUSTOMERID_SHIPMENTID_AND_RATING_ARE_REQUIRED,
      });
    }

    if (!isValidRating(rating)) {
      return res.status(400).json({
        success: false,
        message: apiResponse.RATING_MUST_BE_BETWEEN_1_AND_5,
      });
    }

    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: customerId,
      shipper: shipperId,
      status: "delivered",
    });

    if (!shipment) {
      return res.status(403).json({
        success: false,
        message: apiResponse.YOU_CAN_REVIEW_THIS_CUSTOMER_ONLY_AFTER_DELIVERY_IS_COMPLETED,
      });
    }

    const existingReview = await CustomerReview.findOne({
      shipmentId,
      shipperId,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: apiResponse.YOU_HAVE_ALREADY_REVIEWED_THIS_CUSTOMER_FOR_THIS_SHIPMENT,
      });
    }

    const shipper = await Shipper.findById(shipperId).select("name email").lean();

    const review = await CustomerReview.create({
      customerId,
      shipperId,
      shipmentId,
      shipperName: shipper?.name || shipper?.email || "Shipper",
      rating: Number(rating),
      reviewText: reviewText.trim(),
    });

    return res.status(201).json({
      success: true,
      message: apiResponse.CUSTOMER_REVIEW_SUBMITTED_SUCCESSFULLY,
      data: review,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: apiResponse.YOU_HAVE_ALREADY_REVIEWED_THIS_CUSTOMER_FOR_THIS_SHIPMENT,
      });
    }

    console.error("Add customer review error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_SUBMIT_CUSTOMER_REVIEW,
    });
  }
};

exports.getMyCustomerReviews = async (req, res) => {
  try {
    const shipperId = req.user._id || req.user.id;

    const reviews = await CustomerReview.find({ shipperId })
      .select("customerId shipmentId rating reviewText createdAt")
      .lean();

    return res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error("Get shipper customer reviews error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_SUBMITTED_CUSTOMER_REVIEWS,
    });
  }
};

exports.getReceivedCustomerReviews = async (req, res) => {
  try {
    const customerId = req.user._id || req.user.id;

    const reviews = await CustomerReview.find({
      customerId,
      isHidden: false,
      reviewStatus: "approved",
    })
      .populate("shipperId", "name email profileImage profilePicture")
      .populate("shipmentId", "shipmentCode pickupLocation deliveryLocation")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error("Get received customer reviews error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_CUSTOMER_REVIEWS,
    });
  }
};

exports.getPublicHappyConsumers = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 60, 100);

    const reviews = await CustomerReview.find({
      isHidden: false,
      reviewStatus: "approved",
      rating: { $gte: 4 },
    })
      .populate("customerId", "name firstName lastName profileImage profilePicture")
      .populate("shipperId", "name companyName profileImage profilePicture")
      .populate("shipmentId", "shipmentCode pickupLocation deliveryLocation")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: reviews.map((review) => ({
        _id: review._id,
        rating: review.rating,
        reviewText: review.reviewText,
        createdAt: review.createdAt,
        customer: {
          name:
            review.customerId?.name ||
            [review.customerId?.firstName, review.customerId?.lastName]
              .filter(Boolean)
              .join(" ") ||
            "Happy Customer",
          profileImage:
            review.customerId?.profileImage?.url ||
            review.customerId?.profilePicture ||
            "",
        },
        shipper: {
          name:
            review.shipperId?.companyName ||
            review.shipperId?.name ||
            review.shipperName ||
            "Horse Shipt Shipper",
          profileImage:
            review.shipperId?.profileImage?.url ||
            review.shipperId?.profilePicture ||
            "",
        },
        shipment: {
          code: review.shipmentId?.shipmentCode || "",
          pickupLocation: review.shipmentId?.pickupLocation || "",
          deliveryLocation: review.shipmentId?.deliveryLocation || "",
        },
      })),
    });
  } catch (error) {
    console.error("Get public happy consumers error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_HAPPY_CONSUMERS,
    });
  }
};
