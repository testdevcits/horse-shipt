// utils/notifyQuote/sendSMS.js
const axios = require("axios");

/**
 * Send SMS using Fast2SMS
 * @param {Object} options
 * @param {string} options.phone - Recipient phone number (with +91)
 * @param {string} options.message - SMS content
 */
const sendSMS = async ({ phone, message }) => {
  try {
    if (!phone) throw new Error("Phone number is required");
    if (!message) throw new Error("Message is required");

    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) throw new Error("FAST2SMS_API_KEY missing in .env");

    // Ensure phone has no spaces
    const formattedPhone = phone.replace(/\s+/g, "");

    // Send SMS via Fast2SMS latest API (header-based authorization)
    const response = await axios.get(
      `https://www.fast2sms.com/dev/bulkV2?route=transactional&numbers=${formattedPhone}&message=${encodeURIComponent(
        message
      )}`,
      {
        headers: {
          authorization: apiKey,
        },
      }
    );

    // Log success response
    console.log("[INFO] SMS sent:", response.data);
    return response.data;
  } catch (err) {
    // Log detailed error response if available
    if (err.response) {
      console.error("[ERROR] sendSMS failed:", err.response.data);
    } else {
      console.error("[ERROR] sendSMS failed:", err.message);
    }
  }
};

module.exports = { sendSMS };
