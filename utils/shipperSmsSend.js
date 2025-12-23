const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send SMS to a shipper using Twilio
 * @param {ObjectId} shipperId - Shipper MongoDB ID
 * @param {String} message - SMS body
 */
const shipperSmsSend = async (shipperId, message) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      console.warn(`[SHIPPER SMS DEBUG] Shipper not found: ${shipperId}`);
      return;
    }

    if (!shipper.phone || !shipper.phone.startsWith("+")) {
      console.warn(
        `[SHIPPER SMS DEBUG] Invalid phone number for shipper: ${shipper._id}`
      );
      return;
    }

    console.log(`[SHIPPER SMS DEBUG] Sending SMS to: ${shipper.phone}`);
    console.log(`[SHIPPER SMS DEBUG] Message: ${message}`);

    const sms = await client.messages.create({
      from: process.env.TWILIO_PHONE,
      to: shipper.phone,
      body: message,
    });

    console.log(`[SHIPPER SMS DEBUG] SMS sent successfully. SID: ${sms.sid}`);
  } catch (error) {
    console.error(
      `[SHIPPER SMS ERROR] Error sending SMS to shipper ID: ${shipperId}`,
      error
    );
  }
};

module.exports = shipperSmsSend;
