// utils/notifyQuote/sendSMS.js
const twilio = require("twilio");

/**
 * Format phone to E.164 (+91XXXXXXXXXX)
 */
const formatPhone = (phone) => {
  if (!phone) return null;

  const cleaned = phone.replace(/\D/g, "");

  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;

  return null;
};

/**
 * Send SMS using Twilio
 */
const sendSMS = async ({ phone, message }) => {
  try {
    if (!phone) throw new Error("Phone required");
    if (!message) throw new Error("Message required");

    const formattedPhone = formatPhone(phone);

    if (!formattedPhone) {
      throw new Error(`Invalid phone format: ${phone}`);
    }

    const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE } = process.env;

    if (!TWILIO_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) {
      throw new Error("Missing Twilio env config");
    }

    const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

    const response = await client.messages.create({
      body: message,
      from: TWILIO_PHONE,
      to: formattedPhone,
    });

    return response;
  } catch (err) {
    console.error("[ERROR] sendSMS:", err.message);
    throw err;
  }
};

module.exports = { sendSMS };
