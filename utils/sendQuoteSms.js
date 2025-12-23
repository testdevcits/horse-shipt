const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send SMS to a shipper by ID
 * @param {String} shipperId - MongoDB ID
 * @param {String} message - SMS body
 */
const sendQuoteSms = async (shipperId, message) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      console.warn("Shipper not found:", shipperId);
      return;
    }

    if (!shipper.phone || !shipper.phone.startsWith("+")) {
      console.warn(`Invalid phone number for shipper: ${shipper._id}`);
      return;
    }

    await client.messages.create({
      from: process.env.TWILIO_PHONE,
      to: shipper.phone,
      body: message,
    });

    console.log(`Quote SMS sent to ${shipper.phone}`);
  } catch (error) {
    console.error("Error sending quote SMS:", error);
  }
};

module.exports = { sendQuoteSms };
