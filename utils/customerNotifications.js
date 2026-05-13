const webpush = require("web-push");
const {
  getCustomerNotificationSettings,
  isCustomerNotificationEnabled,
} = require("./notificationPreferences");

// VAPID keys
webpush.setVapidDetails(
  "mailto:citstestjitu@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Send notification to a user respecting their settings
 * @param {ObjectId} userId - MongoDB user ID
 * @param {String} type - notification type (newQuote, newMessage, etc.)
 * @param {Object} payload - { title, body }
 */
const sendCustomerNotification = async (userId, type, payload) => {
  try {
    const userSettings = await getCustomerNotificationSettings(userId);
    const enabled = await isCustomerNotificationEnabled(userId, type);

    if (!enabled) return; // User disabled this notification

    if (userSettings.subscription) {
      await webpush.sendNotification(
        userSettings.subscription,
        JSON.stringify(payload)
      );
    }
  } catch (err) {
    console.error("Error sending customer notification:", err);
  }
};

module.exports = { sendCustomerNotification };
