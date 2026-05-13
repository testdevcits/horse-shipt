// utils/notifyShipper.js
const { getShipperChannelSettings } = require("./notificationPreferences");
const { sendShipperEmail } = require("./shipperMailSend");
const { sendShipperSms } = require("./shipperSmsSend");

/**
 * Notify shipper dynamically based on their settings.
 * @param {Object} options
 * @param {String} options.shipperId - Shipper's ObjectId
 * @param {String} options.type - "quote", "shipment", "message", etc.
 * @param {String} options.emailSubject
 * @param {String} options.emailContent
 * @param {String} options.smsContent
 */
const notifyShipper = async ({
  shipperId,
  type,
  emailSubject,
  emailContent,
  smsContent,
}) => {
  try {
    const notify = await getShipperChannelSettings(shipperId, type);
    if (!notify) return console.log(`Unknown notification type: ${type}`);

    if (notify.email) await sendShipperEmail(shipperId, emailSubject, emailContent);
    if (notify.sms) await sendShipperSms(shipperId, smsContent);
  } catch (err) {
    console.error("Error in notifyShipper:", err);
  }
};

module.exports = notifyShipper;
