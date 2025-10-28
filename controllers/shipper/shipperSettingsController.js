const ShipperSettings = require("../../models/shipper/shipperSettingsModel");

// =====================================================
// Get Shipper Notification Settings
// =====================================================
exports.getSettings = async (req, res) => {
  try {
    const shipperId = req.user._id;

    let settings = await ShipperSettings.findOne({ shipperId });

    // if not exist, create default settings
    if (!settings) {
      settings = await ShipperSettings.create({ shipperId });
    }

    return res.status(200).json({
      success: true,
      message: "Shipper settings fetched successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching shipper settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shipper settings",
    });
  }
};

// =====================================================
// Update Shipper Notification Settings
// =====================================================
exports.updateSettings = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { notifications } = req.body;

    if (!notifications) {
      return res.status(400).json({
        success: false,
        message: "Notifications data is required",
      });
    }

    const updated = await ShipperSettings.findOneAndUpdate(
      { shipperId },
      { $set: { notifications } },
      { new: true, upsert: true } // create if doesn't exist
    );

    return res.status(200).json({
      success: true,
      message: "Shipper settings updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating shipper settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update shipper settings",
    });
  }
};
