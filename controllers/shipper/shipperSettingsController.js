const { apiResponse } = require("../../responses/api.response");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");

// =====================================================
// Get Shipper Notification Settings (Logged-in Shipper)
// =====================================================
exports.getSettings = async (req, res) => {
  try {
    const shipperId = req.user._id;

    let settings = await ShipperSettings.findOne({ shipperId });

    // if not exist, create default settings
    if (!settings) {
      settings = await ShipperSettings.create({ shipperId });
    }

    if (!settings.notifications?.question) {
      settings.notifications.question = { email: true, sms: true };
      await settings.save();
    }

    return res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_SETTINGS_FETCHED_SUCCESSFULLY,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching shipper settings:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_SHIPPER_SETTINGS,
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
        message: apiResponse.NOTIFICATIONS_DATA_IS_REQUIRED,
      });
    }

    const updated = await ShipperSettings.findOneAndUpdate(
      { shipperId },
      { $set: { notifications } },
      { new: true, upsert: true } // create if doesn't exist
    );

    return res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_SETTINGS_UPDATED_SUCCESSFULLY,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating shipper settings:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_UPDATE_SHIPPER_SETTINGS,
    });
  }
};

// =====================================================
// Get Shipper Notification Settings by Shipper ID
// =====================================================
exports.getSettingsById = async (req, res) => {
  try {
    const { shipperId } = req.params;

    if (!shipperId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.SHIPPER_ID_IS_REQUIRED,
      });
    }

    const settings = await ShipperSettings.findOne({ shipperId });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SETTINGS_NOT_FOUND_FOR_THIS_SHIPPER_ID,
      });
    }

    return res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_SETTINGS_FETCHED_SUCCESSFULLY_BY_ID,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching shipper settings by ID:", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_SHIPPER_SETTINGS_BY_ID,
    });
  }
};
