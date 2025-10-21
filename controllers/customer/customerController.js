const Customer = require("../../models/customer/customerModel");
const fs = require("fs");
const path = require("path");

// ------------------ Profile Update ------------------
exports.updateProfile = async (req, res) => {
  try {
    const user = req.user; // From customerAuth middleware

    const { firstName, lastName, locale } = req.body;

    // Merge firstName + lastName into name
    if (firstName || lastName) {
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }

    if (locale) user.locale = locale;

    // Handle profile picture
    if (req.file) {
      if (user.profilePicture) {
        const oldPath = path.join(__dirname, "../../", user.profilePicture);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      user.profilePicture = req.file.path;
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: user,
      message: "Customer profile updated successfully",
    });
  } catch (err) {
    console.error("[CUSTOMER PROFILE UPDATE] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
