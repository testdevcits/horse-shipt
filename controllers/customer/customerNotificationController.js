const { apiResponse } = require("../../responses/api.response");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");

// ---------------- Get Current User Notification Settings ----------------
exports.getSettings = async (req, res) => {
  try {
    const userId = req.user._id;

    // Try to find notification settings
    let notification = await CustomerNotification.findOne({ user: userId });

    // If not exists, create default with all settings true
    if (!notification) {
      notification = await CustomerNotification.create({ user: userId });
    }

    if (notification.settings.question === undefined) {
      notification.settings.question = true;
      await notification.save();
    }

    return res.status(200).json({
      success: true,
      message: apiResponse.NOTIFICATION_SETTINGS_FETCHED_SUCCESSFULLY,
      data: notification.settings,
    });
  } catch (err) {
    console.error("Get Notification Settings Error:", err);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_FETCH_NOTIFICATION_SETTINGS,
    });
  }
};

// ---------------- Update a Single Notification Setting ----------------
exports.updateSetting = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type } = req.params; // e.g., newQuote, newMessage
    const { value } = req.body; // true/false

    let notification = await CustomerNotification.findOne({ user: userId });

    // If not exists, create default
    if (!notification) {
      notification = await CustomerNotification.create({ user: userId });
    }

    if (notification.settings.question === undefined) {
      notification.settings.question = true;
    }

    // Check if type is valid
    if (!(type in notification.settings)) {
      return res.status(400).json({
        success: false,
        message: apiResponse.INVALID_NOTIFICATION_TYPE,
      });
    }

    notification.settings[type] = value;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: `${type} notification updated successfully`,
      data: notification.settings,
    });
  } catch (err) {
    console.error("Update Notification Setting Error:", err);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_UPDATE_NOTIFICATION_SETTING,
    });
  }
};
