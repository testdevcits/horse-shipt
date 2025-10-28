// utils/shipperSmsSend.js
const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

// Initialize Twilio client
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send SMS to a shipper using Twilio
 * @param {ObjectId} shipperId - Shipper's MongoDB ID
 * @param {String} message - Message body
 */
const shipperSmsSend = async (shipperId, message) => {
  try {
    const shipper = await Shipper.findById(shipperId);
    if (!shipper) {
      console.warn("Shipper not found:", shipperId);
      return;
    }

    // Validate phone number
    if (!shipper.phone || !shipper.phone.startsWith("+")) {
      console.warn(`Invalid or missing phone for shipper: ${shipper._id}`);
      return;
    }

    // Send message
    const result = await client.messages.create({
      from: process.env.TWILIO_PHONE,
      to: shipper.phone,
      body: message,
    });

    console.log(`SMS sent successfully to ${shipper.phone}`);
    return result; // return message SID if needed
  } catch (error) {
    console.error("Error sending shipper SMS:", error.message);
  }
};

module.exports = { shipperSmsSend };
