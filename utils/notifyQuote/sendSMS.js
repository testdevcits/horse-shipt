// utils/notifyQuote/sendSMS.js
const twilio = require("twilio");

/**
 * Send Transactional SMS using Twilio
 * @param {Object} options
 * @param {string} options.phone - Recipient phone number (with +91 if India)
 * @param {string} options.message - SMS content
 */
const sendSMS = async ({ phone, message }) => {
  try {
    if (!phone) throw new Error("Phone number is required");
    if (!message) throw new Error("Message is required");

    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE; // your Twilio number

    if (!accountSid || !authToken || !fromNumber)
      throw new Error(
        "Twilio credentials missing in .env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)"
      );

    // Format phone number
    let formattedPhone = phone.replace(/\D/g, "");
    if (/^\d{10}$/.test(formattedPhone)) {
      formattedPhone = `+91${formattedPhone}`;
    }

    const client = twilio(accountSid, authToken);

    const response = await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedPhone,
    });

    console.log("[INFO] SMS sent via Twilio:", response.sid);
    return response;
  } catch (err) {
    console.error("[ERROR] sendSMS failed (Twilio):", err.message);
  }
};

module.exports = { sendSMS };
