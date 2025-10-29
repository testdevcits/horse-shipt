const cloudinary = require("cloudinary").v2;
const Shipper = require("../../models/shipper/shipperModel");

// -----------------------------
// Cloudinary Configuration
// -----------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===================================================
//Get Shipper Profile
// ===================================================
exports.getShipperProfile = async (req, res) => {
  try {
    const shipper = await Shipper.findById(req.user.id)
      .select(
        "uniqueId name email role firstName lastName emailVerified " +
          "profilePicture profileImage bannerImage currentLocation isLogin"
      )
      .lean();

    if (!shipper) {
      return res.status(404).json({
        success: false,
        message: "Shipper not found",
      });
    }

    // Handle default profile & banner images
    const defaultProfile =
      shipper.profileImage?.url ||
      shipper.profilePicture ||
      "/images/default_profile.png";

    const defaultBanner =
      shipper.bannerImage?.url || "/images/default_banner.png";

    res.status(200).json({
      success: true,
      message: "Shipper profile fetched successfully",
      data: {
        uniqueId: shipper.uniqueId,
        name: shipper.name,
        email: shipper.email,
        role: shipper.role,
        firstName: shipper.firstName,
        lastName: shipper.lastName,
        emailVerified: shipper.emailVerified,
        currentLocation: shipper.currentLocation,
        isLogin: shipper.isLogin,
        profileImage: defaultProfile,
        bannerImage: defaultBanner,
      },
    });
  } catch (error) {
    console.error("Get Shipper Profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shipper profile",
    });
  }
};

// ===================================================
// Update Profile Image
// ===================================================
exports.updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const shipperId = req.user.id;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "shipperProfileImages",
    });

    // Update in MongoDB
    const shipper = await Shipper.findByIdAndUpdate(
      shipperId,
      {
        "profileImage.url": result.secure_url,
        "profileImage.public_id": result.public_id,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      profileImage: shipper.profileImage,
    });
  } catch (error) {
    console.error("Update Profile Image error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to upload profile image" });
  }
};

// ===================================================
// Update Banner Image
// ===================================================
exports.updateBannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const shipperId = req.user.id;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "shipperBannerImages",
    });

    // Update in MongoDB
    const shipper = await Shipper.findByIdAndUpdate(
      shipperId,
      {
        "bannerImage.url": result.secure_url,
        "bannerImage.public_id": result.public_id,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Banner image updated successfully",
      bannerImage: shipper.bannerImage,
    });
  } catch (error) {
    console.error("Update Banner Image error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to upload banner image" });
  }
};
