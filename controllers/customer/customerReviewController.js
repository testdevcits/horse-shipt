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
        message: "customerId, shipmentId and rating are required",
      });
    }

    if (!isValidRating(rating)) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
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
        message: "You can review this customer only after delivery is completed",
      });
    }

    const existingReview = await CustomerReview.findOne({
      shipmentId,
      shipperId,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this customer for this shipment",
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
      message: "Customer review submitted successfully",
      data: review,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this customer for this shipment",
      });
    }

    console.error("Add customer review error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit customer review",
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
      message: "Failed to fetch submitted customer reviews",
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
      message: "Failed to fetch customer reviews",
    });
  }
};
