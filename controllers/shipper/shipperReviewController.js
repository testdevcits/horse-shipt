const mongoose = require("mongoose");

const Review = require("../../models/shipper/review.model");
const Shipper = require("../../models/shipper/shipperModel");

const { REVIEW_MESSAGES } = require("../../utils/response/reviewResponse");

/*
=====================================================
Validate Rating
=====================================================
*/
function validateRating(rating) {
  return rating >= 1 && rating <= 5;
}

/*
=====================================================
Validate Google Review Link
=====================================================
*/
function validateGoogleLink(link) {
  const regex =
    /^https:\/\/(www\.)?(google\.com\/maps\/place\/|search\.google\.com\/local\/writereview\?placeid=).*/;
  return regex.test(link);
}

/*
=====================================================
Update Average Rating (Only Approved + Visible)
=====================================================
*/
async function updateAverageRating(shipperId) {
  const result = await Review.aggregate([
    {
      $match: {
        shipperId: new mongoose.Types.ObjectId(shipperId),
        isHidden: false,
        reviewStatus: "approved",
      },
    },
    {
      $group: {
        _id: "$shipperId",
        avgRating: { $avg: "$rating" },
      },
    },
  ]);

  const avgRating = result.length ? result[0].avgRating : 0;

  await Shipper.findByIdAndUpdate(shipperId, {
    averageRating: avgRating,
  });
}

/*
=====================================================
CUSTOMER → Add Manual Review
=====================================================
*/
exports.addReview = async (req, res) => {
  try {
    const customerId = req.user.id;
    const customerName = req.user.name;

    const { shipperId, reviewText, rating, shipmentId } = req.body;

    if (!rating) {
      return res.status(400).json({
        success: false,
        message: "Rating is required",
      });
    }

    if (!validateRating(rating)) {
      return res.status(400).json({
        success: false,
        message: REVIEW_MESSAGES.INVALID_RATING,
      });
    }

    const shipper = await Shipper.findById(shipperId);
    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: REVIEW_MESSAGES.SHIPPER_NOT_FOUND,
      });
    }

    const existingReview = await Review.findOne({
      shipmentId,
      customerId,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: REVIEW_MESSAGES.ALREADY_REVIEWED,
      });
    }

    await Review.create({
      shipperId,
      shipmentId,
      customerId,
      customerName,
      reviewText: reviewText?.trim(),
      rating,
      source: "manual",
      reviewStatus: "approved",
    });

    await updateAverageRating(shipperId);

    return res.status(201).json({
      success: true,
      message: REVIEW_MESSAGES.REVIEW_ADDED,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate review not allowed",
      });
    }

    return res.status(500).json({
      success: false,
      message: REVIEW_MESSAGES.SERVER_ERROR,
    });
  }
};

/*
=====================================================
SHIPPER → Add / Update Google Review Link
=====================================================
*/
exports.updateGoogleReviewLink = async (req, res) => {
  try {
    console.log("=== Google Review Update Started ===");

    const shipperId = req.user?.id;
    const { googleReviewLink } = req.body;

    if (!shipperId || !googleReviewLink) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    if (!validateGoogleLink(googleReviewLink)) {
      return res.status(400).json({
        success: false,
        message: "Invalid link",
      });
    }

    const Shipper = require("../../models/shipper/shipperModel");

    const result = await Shipper.findByIdAndUpdate(
      shipperId,
      {
        $set: {
          googleReviewLink: googleReviewLink.trim(),
        },
      },
      {
        new: true,
      }
    );

    console.log("DB Stored Link:", result?.googleReviewLink);

    return res.status(200).json({
      success: true,
      message: "Google review link updated successfully",
      data: result.googleReviewLink,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get Google Review Link
exports.getGoogleReviewLink = async (req, res) => {
  try {
    const shipperId = req.user.id; // from shipperAuth middleware

    const shipper = await Shipper.findById(shipperId).select(
      "googleReviewLink"
    );

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    return res.status(200).json({
      success: true,
      googleReviewLink: shipper.googleReviewLink || "",
    });
  } catch (error) {
    console.error("Get Google Review Link Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
/*
=====================================================
Get Reviews By Shipper (Pagination)
?page=1&limit=10
=====================================================
*/
exports.getReviewsByShipper = async (req, res) => {
  try {
    const shipperId = req.params.shipperId;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const reviews = await Review.find({
      shipperId,
      isHidden: false,
      reviewStatus: "approved",
    })
      .populate("customerId", "name email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalReviews = await Review.countDocuments({
      shipperId,
      isHidden: false,
      reviewStatus: "approved",
    });

    const shipper = await Shipper.findById(shipperId).select(
      "name averageRating googleReviewLink"
    );

    return res.status(200).json({
      success: true,
      message: REVIEW_MESSAGES.REVIEW_FETCHED,
      data: {
        shipper,
        reviews,
        pagination: {
          currentPage: page,
          limit,
          totalRecords: totalReviews,
          totalPages: Math.ceil(totalReviews / limit),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: REVIEW_MESSAGES.SERVER_ERROR,
    });
  }
};

/*
=====================================================
Admin → Hide Review
=====================================================
*/
exports.hideReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: REVIEW_MESSAGES.REVIEW_NOT_FOUND,
      });
    }

    review.isHidden = true;
    await review.save();

    await updateAverageRating(review.shipperId);

    return res.status(200).json({
      success: true,
      message: REVIEW_MESSAGES.REVIEW_HIDDEN,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: REVIEW_MESSAGES.SERVER_ERROR,
    });
  }
};

/*
=====================================================
CUSTOMER → Update My Review
=====================================================
*/
exports.updateMyReview = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { reviewId } = req.params;
    const { reviewText, rating } = req.body;

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: REVIEW_MESSAGES.INVALID_RATING,
      });
    }

    const review = await Review.findOne({
      _id: reviewId,
      customerId,
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: REVIEW_MESSAGES.REVIEW_NOT_FOUND,
      });
    }

    if (reviewText) review.reviewText = reviewText;
    if (rating) review.rating = rating;

    await review.save();
    await updateAverageRating(review.shipperId);

    return res.status(200).json({
      success: true,
      message: REVIEW_MESSAGES.REVIEW_UPDATED,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: REVIEW_MESSAGES.SERVER_ERROR,
    });
  }
};

/*
=====================================================
CUSTOMER → Delete My Review
=====================================================
*/
exports.deleteMyReview = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { reviewId } = req.params;

    const review = await Review.findOne({
      _id: reviewId,
      customerId,
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: REVIEW_MESSAGES.REVIEW_NOT_FOUND,
      });
    }

    await Review.deleteOne({ _id: reviewId });
    await updateAverageRating(review.shipperId);

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: REVIEW_MESSAGES.SERVER_ERROR,
    });
  }
};

/*
=====================================================
CUSTOMER → Get My Reviews
=====================================================
*/
exports.getMyReviews = async (req, res) => {
  try {
    const customerId = req.user.id;

    const reviews = await Review.find({ customerId })
      .populate("shipperId", "name averageRating")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "My reviews fetched successfully",
      data: reviews,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: REVIEW_MESSAGES.SERVER_ERROR,
    });
  }
};

// GET /shippers/top-rated
exports.getTopRatedShippers = async (req, res) => {
  try {
    // Aggregate reviews by shipperId and calculate average rating
    const topShippers = await Review.aggregate([
      { $match: { reviewStatus: "approved", isHidden: false } }, // only approved reviews
      {
        $group: {
          _id: "$shipperId",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
      { $sort: { averageRating: -1, totalReviews: -1 } }, // highest rating first
      { $limit: 10 }, // top 10
    ]);

    // Populate shipper info
    const populatedShippers = await Shipper.find({
      _id: { $in: topShippers.map((s) => s._id) },
    });

    // Map ratings with shipper info into ShipperReviewCard format
    const result = topShippers.map((s) => {
      const shipperInfo = populatedShippers.find(
        (sh) => sh._id.toString() === s._id.toString()
      );

      return {
        id: s._id, // for navigation
        name: shipperInfo?.name || "Unknown",
        profileImage: shipperInfo?.profileImage?.url || "/default-avatar.png",
        rating: Number(s.averageRating.toFixed(1)),
        reviewText: `${s.totalReviews} Reviews`,
        region: shipperInfo?.region || "Unknown",
        googleReviewLink: shipperInfo?.googleReviewLink || null,
      };
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching top rated shippers:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
