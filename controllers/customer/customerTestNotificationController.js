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
        message: "No push subscription found for this user",
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
      message: "Test notification sent successfully",
    });
  } catch (err) {
    console.error("Test notification error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to send test notification" });
  }
};
