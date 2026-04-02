// utils/notifyQuote/sendSMS.js
const twilio = require("twilio");

/**
 * Send Transactional SMS using Twilio
 */
const sendSMS = async ({ phone, message }) => {
  try {
    if (!phone) throw new Error("Phone number is required");
    if (!message) throw new Error("Message is required");

    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio credentials missing in .env");
    }

    // FINAL SAFETY FORMAT (again double-check)
    let formattedPhone = phone.replace(/\D/g, "");

    if (/^91\d{10}$/.test(formattedPhone)) {
      formattedPhone = `+${formattedPhone}`;
    } else if (/^\d{10}$/.test(formattedPhone)) {
      formattedPhone = `+91${formattedPhone}`;
    } else {
      throw new Error(`Invalid phone number format: ${phone}`);
    }

    console.log("[DEBUG] Sending SMS to:", formattedPhone);

    const client = twilio(accountSid, authToken);

    const response = await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedPhone,
    });

    console.log("[SUCCESS] SMS sent via Twilio:", response.sid);
    return response;
  } catch (err) {
    console.error("[ERROR] sendSMS failed (Twilio):", err.message);
    throw err; // important so caller knows it failed
  }
};

module.exports = { sendSMS };
