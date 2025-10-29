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
// Update Profile Image
// ===================================================
exports.updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const shipperId = req.user.id;

    // Upload to Cloudinary folder
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
      message: "Profile image updated successfully",
      profileImage: shipper.profileImage,
    });
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    res.status(500).json({ message: "Failed to upload profile image" });
  }
};

// ===================================================
// Update Banner Image
// ===================================================
exports.updateBannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const shipperId = req.user.id;

    // Upload to Cloudinary folder
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
      message: "Banner image updated successfully",
      bannerImage: shipper.bannerImage,
    });
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    res.status(500).json({ message: "Failed to upload banner image" });
  }
};
