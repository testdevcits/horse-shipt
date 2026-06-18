const { apiResponse } = require("../../responses/api.response");
const webpush = require("web-push");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");

// Send test notification to current user
exports.sendTestNotification = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find user's notification settings
    const notif = await CustomerNotification.findOne({ user: userId });
    if (!notif || !notif.subscription) {
      return res.status(400).json({
        success: false,
        message: apiResponse.NO_PUSH_SUBSCRIPTION_FOUND_FOR_THIS_USER,
      });
    }

    // Example payload
    const payload = {
      title: "Test Notification",
      body: "This is a test notification from HorseShipt!",
      type: "test",
    };

    // Send notification only if settings allow
    await webpush.sendNotification(notif.subscription, JSON.stringify(payload));

    res.status(200).json({
      success: true,
      message: apiResponse.TEST_NOTIFICATION_SENT_SUCCESSFULLY,
    });
  } catch (err) {
    console.error("Test notification error:", err);
    res
      .status(500)
      .json({ success: false, message: apiResponse.FAILED_TO_SEND_TEST_NOTIFICATION });
  }
};
