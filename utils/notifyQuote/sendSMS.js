const axios = require("axios");

/**
 * Send Transactional SMS using Fast2SMS
 * @param {Object} options
 * @param {string} options.phone - Recipient phone number (with +91 if India)
 * @param {string} options.message - SMS content
 */
const sendSMS = async ({ phone, message }) => {
  try {
    if (!phone) throw new Error("Phone number is required");
    if (!message) throw new Error("Message is required");

    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) throw new Error("FAST2SMS_API_KEY missing in .env");

    // Remove all non-digit characters
    let formattedPhone = phone.replace(/\D/g, "");

    // Add +91 if 10-digit Indian number
    if (/^\d{10}$/.test(formattedPhone)) {
      formattedPhone = `+91${formattedPhone}`;
    }

    // Transactional route (ensures it’s not bulk/promotional)
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

    console.log("[INFO] Transactional SMS sent:", response.data);
    return response.data;
  } catch (err) {
    if (err.response) {
      console.error("[ERROR] sendSMS failed:", err.response.data);
    } else {
      console.error("[ERROR] sendSMS failed:", err.message);
    }
  }
};

module.exports = { sendSMS };
