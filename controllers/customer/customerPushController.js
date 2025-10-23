const CustomerNotification = require("../../models/customer/CustomerNotificationModel");

exports.subscribeToPush = async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription) {
      return res
        .status(400)
        .json({ success: false, message: "Subscription required" });
    }

    // Find or create notification settings
    let notif = await CustomerNotification.findOne({ user: req.user._id });
    if (!notif) {
      notif = await CustomerNotification.create({ user: req.user._id });
    }

    notif.subscription = subscription;
    await notif.save();

    return res.status(200).json({
      success: true,
      message: "Subscribed to push notifications successfully",
    });
  } catch (err) {
    console.error("Push subscription error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to subscribe" });
  }
};
