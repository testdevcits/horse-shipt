const mongoose = require("mongoose");

const CustomerWishlist = require("../../models/customer/CustomerWishlist");
const Shipper = require("../../models/shipper/shipperModel");
const Review = require("../../models/shipper/review.model");
const PreferredArea = require("../../models/shipper/shipperPreferredAreaModel");
const { apiResponse } = require("../../responses/api.response");

const formatPreferredArea = (area) => ({
  id: area._id,
  locationName: area.locationName || "",
  radiusKm: area.radiusKm || 0,
  coordinates: area.coordinates || null,
});

const buildAreaMap = async (shipperIds = []) => {
  const uniqueIds = [
    ...new Set(shipperIds.filter(Boolean).map((id) => id.toString())),
  ];

  if (!uniqueIds.length) return new Map();

  const areas = await PreferredArea.find({ shipper: { $in: uniqueIds } })
    .sort({ createdAt: -1 })
    .lean();

  return areas.reduce((map, area) => {
    const key = area.shipper?.toString();
    if (!key) return map;
    const existing = map.get(key) || [];
    existing.push(formatPreferredArea(area));
    map.set(key, existing);
    return map;
  }, new Map());
};

const buildReviewStatsMap = async (shipperIds = []) => {
  const objectIds = shipperIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!objectIds.length) return new Map();

  const stats = await Review.aggregate([
    {
      $match: {
        shipperId: { $in: objectIds },
        reviewStatus: "approved",
        isHidden: false,
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$shipperId",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
        latestReview: { $first: "$reviewText" },
      },
    },
  ]);

  return new Map(stats.map((stat) => [stat._id.toString(), stat]));
};

const formatWishlistShipper = (shipper, reviewStats, preferredAreas) => ({
  id: shipper._id,
  name: shipper.name || shipper.companyName || shipper.email || "Shipper",
  profileImage:
    shipper.profileImage?.url || shipper.profilePicture || "/default-avatar.png",
  rating: Number((reviewStats?.averageRating || 0).toFixed(1)),
  reviewCount: reviewStats?.totalReviews || 0,
  reviewText: reviewStats?.latestReview || "New shipper in the network",
  region: shipper.locale?.address || preferredAreas[0]?.locationName || "Available",
  preferredAreas,
  googleReviewLink: shipper.googleReviewLink || null,
  isWishlisted: true,
});

exports.getMyWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;

    const wishlist = await CustomerWishlist.find({ customer: customerId })
      .populate({
        path: "shipper",
        match: { isActive: true },
      })
      .sort({ createdAt: -1 })
      .lean();

    const shippers = wishlist.map((item) => item.shipper).filter(Boolean);
    const shipperIds = shippers.map((shipper) => shipper._id);
    const [areaMap, statsMap] = await Promise.all([
      buildAreaMap(shipperIds),
      buildReviewStatsMap(shipperIds),
    ]);

    const data = shippers.map((shipper) => {
      const shipperKey = shipper._id.toString();
      return formatWishlistShipper(
        shipper,
        statsMap.get(shipperKey),
        areaMap.get(shipperKey) || []
      );
    });

    return res.status(200).json({
      success: true,
      data,
      shipperIds: data.map((shipper) => shipper.id),
    });
  } catch (error) {
    console.error("Get customer wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR,
    });
  }
};

exports.toggleWishlistShipper = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { shipperId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shipperId)) {
      return res.status(400).json({
        success: false,
        message: apiResponse.INVALID_REQUEST,
      });
    }

    const shipper = await Shipper.findOne({ _id: shipperId, isActive: true });
    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPPER_NOT_FOUND,
      });
    }

    const existing = await CustomerWishlist.findOne({
      customer: customerId,
      shipper: shipperId,
    });

    if (existing) {
      await existing.deleteOne();
      return res.status(200).json({
        success: true,
        isWishlisted: false,
        message: "Shipper removed from wishlist",
      });
    }

    await CustomerWishlist.create({
      customer: customerId,
      shipper: shipperId,
    });

    return res.status(201).json({
      success: true,
      isWishlisted: true,
      message: "Shipper added to wishlist",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        isWishlisted: true,
        message: "Shipper already in wishlist",
      });
    }

    console.error("Toggle customer wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR,
    });
  }
};

exports.removeWishlistShipper = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { shipperId } = req.params;

    await CustomerWishlist.deleteOne({
      customer: customerId,
      shipper: shipperId,
    });

    return res.status(200).json({
      success: true,
      isWishlisted: false,
      message: "Shipper removed from wishlist",
    });
  } catch (error) {
    console.error("Remove customer wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.SERVER_ERROR,
    });
  }
};
