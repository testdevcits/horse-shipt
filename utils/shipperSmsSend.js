// utils/shipperSmsSend.js
const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send SMS to a shipper using Twilio
 * @param {ObjectId} shipperId - Shipper's MongoDB ID
 * @param {String} message - Message body
 */
const shipperSmsSend = async (shipperId, message) => {
  try {
    const shipper = await Shipper.findById(shipperId);
    if (!shipper || !shipper.phone) {
      console.warn("No valid phone number for shipper:", shipperId);
      return;
    }

    await client.messages.create({
      from: process.env.TWILIO_PHONE,
      to: shipper.phone,
      body: message,
    });

    console.log(`SMS sent successfully to ${shipper.phone}`);
  } catch (error) {
    console.error("Error sending SMS:", error);
  }
};

module.exports = shipperSmsSend;
