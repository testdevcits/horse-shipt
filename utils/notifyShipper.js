// utils/notifyShipper.js
const ShipperSettings = require("../models/ShipperSettings");
const sendEmail = require("./shipperMailSend");
const sendSMS = require("./shipperSmsSend");

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
    const settings =
      (await ShipperSettings.findOne({ shipperId })) ||
      (await ShipperSettings.create({
        shipperId,
        notifications: {
          quote: { email: true, sms: true },
          opportunity: { email: true, sms: true },
          message: { email: true, sms: true },
          review: { email: true, sms: true },
          shipment: { email: true, sms: true },
        },
      }));

    const notify = settings.notifications[type];
    if (!notify) return console.log(`Unknown notification type: ${type}`);

    if (notify.email) await sendEmail(shipperId, emailSubject, emailContent);
    if (notify.sms) await sendSMS(shipperId, smsContent);
  } catch (err) {
    console.error("Error in notifyShipper:", err);
  }
};

module.exports = notifyShipper;
