// utils/sendQuoteSms.js
const twilio = require("twilio");
const Shipper = require("../models/shipper/shipperModel");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send SMS to a shipper by ID
 * @param {String} shipperId - MongoDB ID
 * @param {Object} options
 *   - message (optional if shipment/customer provided)
 *   - shipment (optional)
 *   - customer (optional)
 *   - totalPrice (optional, required if shipment provided)
 *   - currency (optional, required if shipment provided)
 */
const sendQuoteSms = async (shipperId, options = {}) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper) {
      console.warn("[SMS] Shipper not found:", shipperId);
      return;
    }

    if (!shipper.phone) {
      console.warn(`[SMS] Invalid phone number for shipper: ${shipper._id}`);
      return;
    }

    // Format phone number
    let phoneToUse = shipper.phone.replace(/\D/g, "");
    if (/^\d{10}$/.test(phoneToUse)) phoneToUse = `+91${phoneToUse}`;
    if (!phoneToUse.startsWith("+")) phoneToUse = `+${phoneToUse}`; // fallback

    // Compose message
    let message = options.message;
    if (!message && options.shipment && options.customer) {
      const customerName = options.customer.name || "Customer";
      const customerEmail = options.customer.email
        ? ` (${options.customer.email})`
        : "";
      message = `New quote received for shipment ${options.shipment.shipmentCode} from ${customerName}${customerEmail}. Amount: ${options.totalPrice} ${options.currency}. Check your dashboard for details.`;
    }

    if (!message) {
      console.warn("[SMS] No message content provided");
      return;
    }

    const sms = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE, // your Twilio number
      to: phoneToUse,
    });

    console.log(`[SMS] Quote SMS sent to ${phoneToUse} (SID: ${sms.sid})`);
    return sms;
  } catch (err) {
    console.error("[SMS ERROR] sendQuoteSms failed:", err.message);
  }
};

module.exports = { sendQuoteSms };
