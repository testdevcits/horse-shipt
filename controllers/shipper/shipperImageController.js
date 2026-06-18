const { apiResponse } = require("../../responses/api.response");
const cloudinary = require("cloudinary").v2;
const Shipper = require("../../models/shipper/shipperModel");
const Review = require("../../models/shipper/review.model");

// -----------------------------
// Cloudinary Configuration
// -----------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===================================================
// Get Shipper Profile
// ===================================================
exports.getShipperProfile = async (req, res) => {
  try {

    const shipper = await Shipper.findById(req.user.id)
      .select(
        "uniqueId name email role firstName lastName locale emailVerified " +
          "profileImage profilePicture bannerImage currentLocation isLogin accountStatus " +
          "description mobile"
      )
      .lean();

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPPER_NOT_FOUND,
      });
    }

    // ================================
    // Profile Image Resolution Priority
    // ================================
    const resolvedProfileImage =
      shipper.profileImage?.url ||
      shipper.profilePicture ||
      "/images/default_profile.png";

    // ================================
    // Banner Image Resolution
    // ================================
    const resolvedBannerImage =
      shipper.bannerImage?.url || "/images/default_banner.png";

    const reviews = await Review.find({
      shipperId: shipper._id,
      reviewStatus: "approved",
      isHidden: false,
    })
      .populate("customerId", "name email profileImage profilePicture")
      .sort({ createdAt: -1 })
      .select("customerName rating reviewText createdAt source customerId")
      .lean();

    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) /
          reviews.length
        : 0;

    res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_PROFILE_FETCHED_SUCCESSFULLY,
      data: {
        uniqueId: shipper.uniqueId,
        name: shipper.name,
        email: shipper.email,
        role: shipper.role,
        firstName: shipper.firstName,
        lastName: shipper.lastName,
        locale: shipper.locale || "",
        emailVerified: shipper.emailVerified,
        currentLocation: shipper.currentLocation || null,
        isLogin: shipper.isLogin,
        accountStatus: shipper.accountStatus || "ACTIVE",
        description: shipper.description || "",
        mobile: shipper.mobile || "",
        profileImage: resolvedProfileImage,
        bannerImage: resolvedBannerImage,
        rating: Number(averageRating.toFixed(1)),
        totalReviews: reviews.length,
        reviews,
      },
    });
  } catch (error) {
    console.error("[GET SHIPPER PROFILE ERROR]", error);

    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_SHIPPER_PROFILE,
    });
  }
};

// ===================================================
// Update Profile Image (Replace Old Image)
// ===================================================
exports.updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: apiResponse.NO_FILE_UPLOADED });
    }

    const shipperId = req.user.id;
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    // Delete old image if exists
    if (shipper.profileImage?.public_id) {
      await cloudinary.uploader.destroy(shipper.profileImage.public_id);
    }

    // Upload new image
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "shipperProfileImages",
      overwrite: true,
    });

    shipper.profileImage = {
      url: result.secure_url,
      public_id: result.public_id,
    };

    await shipper.save();

    res.status(200).json({
      success: true,
      message: apiResponse.PROFILE_IMAGE_UPDATED_SUCCESSFULLY,
      profileImage: shipper.profileImage,
    });
  } catch (error) {
    console.error("Update Profile Image error:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_UPLOAD_PROFILE_IMAGE,
    });
  }
};

// ===================================================
// Update Banner Image (Replace Old Image)
// ===================================================
exports.updateBannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: apiResponse.NO_FILE_UPLOADED });
    }

    const shipperId = req.user.id;
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    // Delete old banner if exists
    if (shipper.bannerImage?.public_id) {
      await cloudinary.uploader.destroy(shipper.bannerImage.public_id);
    }

    // Upload new banner
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "shipperBannerImages",
      overwrite: true,
    });

    shipper.bannerImage = {
      url: result.secure_url,
      public_id: result.public_id,
    };

    await shipper.save();

    res.status(200).json({
      success: true,
      message: apiResponse.BANNER_IMAGE_UPDATED_SUCCESSFULLY,
      bannerImage: shipper.bannerImage,
    });
  } catch (error) {
    console.error("Update Banner Image error:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_UPLOAD_BANNER_IMAGE,
    });
  }
};
