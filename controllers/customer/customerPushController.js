const webpush = require("web-push");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");

// ----------------- Set VAPID keys -----------------
webpush.setVapidDetails(
  "mailto:citstestjitu@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ----------------- Subscribe to Push -----------------
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
    console.error("Push subscription error:", err);
    res.status(500).json({ success: false, message: "Failed to subscribe" });
  }
};

// ----------------- Send Test Notification -----------------
exports.sendTestNotification = async (req, res) => {
  try {
    const notif = await CustomerNotification.findOne({ user: req.user._id });
    if (!notif || !notif.subscription)
      return res
        .status(400)
        .json({ success: false, message: "No push subscription found" });

    const payload = JSON.stringify({
      title: "Test Notification",
      body: "This is a test notification from HorseShipt!",
      type: "test",
    });

    try {
      await webpush.sendNotification(notif.subscription, payload);
    } catch (err) {
      // Handle expired or unsubscribed subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        notif.subscription = null;
        await notif.save();
        return res.status(400).json({
          success: false,
          message:
            "Push subscription has expired or unsubscribed. Please resubscribe.",
        });
      }
      throw err; // re-throw other errors
    }

    res.status(200).json({ success: true, message: "Test notification sent" });
  } catch (err) {
    console.error("Test notification error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to send notification" });
  }
};
