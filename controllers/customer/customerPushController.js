const webpush = require("web-push");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");

// Set VAPID keys
webpush.setVapidDetails(
  "mailto:citstestjitu@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Subscribe endpoint
exports.subscribeToPush = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription)
      return res
        .status(400)
        .json({ success: false, message: "Subscription required" });

    let notif = await CustomerNotification.findOne({ user: req.user._id });
    if (!notif)
      notif = await CustomerNotification.create({ user: req.user._id });

    notif.subscription = subscription;
    await notif.save();

    res.status(200).json({ success: true, message: "Subscribed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to subscribe" });
  }
};

// Test notification
exports.sendTestNotification = async (req, res) => {
  try {
    const notif = await CustomerNotification.findOne({ user: req.user._id });
    if (!notif || !notif.subscription)
      return res
        .status(400)
        .json({ success: false, message: "No subscription found" });

    const payload = JSON.stringify({
      title: "Test Notification",
      body: "This is a test notification from HorseShipt!",
      type: "test",
    });

    await webpush.sendNotification(notif.subscription, payload);
    res.status(200).json({ success: true, message: "Test notification sent" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to send notification" });
  }
};
