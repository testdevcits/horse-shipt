const { chatLog } = require("./chatDiagnostics");
const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send SMS to a shipper using Twilio
 * @param {ObjectId} shipperId - Shipper's MongoDB ID
 * @param {String} message - Message body
 */
const sendShipperSms = async (shipperId, message) => {
  try {
    chatLog("notification.channel.start", { role: "shipper", userId: shipperId, channel: "sms" });
    const shipper = await Shipper.findById(shipperId);
    if (!shipper) {
      console.warn("Shipper not found:", shipperId);
      chatLog("notification.channel.skipped", { role: "shipper", userId: shipperId, channel: "sms", reason: "missing_recipient" });
      return;
    }

    const phone = shipper.mobile || shipper.phone;

    if (!phone || !phone.startsWith("+")) {
      console.warn(`Invalid or missing phone for shipper: ${shipper._id}`);
      chatLog("notification.channel.skipped", { role: "shipper", userId: shipperId, channel: "sms", reason: "missing_recipient" });
      return;
    }

    await client.messages.create({
      from: process.env.TWILIO_PHONE,
      to: phone,
      body: message,
    });
    chatLog("notification.channel.sent", { role: "shipper", userId: shipperId, channel: "sms" });
  } catch (error) {
    chatLog("notification.channel.failed", { role: "shipper", userId: shipperId, channel: "sms", errorCode: error.code, status: error.status });
    console.error("Error sending shipper SMS:", error.message);
  }
};

module.exports = { sendShipperSms };
