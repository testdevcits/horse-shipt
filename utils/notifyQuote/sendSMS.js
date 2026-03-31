// utils/notifyQuote/sendSMS.js
const axios = require("axios");

const sendSMS = async ({ phone, message }) => {
  try {
    if (!phone) throw new Error("Phone number is required");
    if (!message) throw new Error("Message is required");

    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) throw new Error("FAST2SMS_API_KEY missing in .env");

    const response = await axios.get(
      `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=transactional&numbers=${phone}&message=${encodeURIComponent(
        message
      )}`
    );

    console.log("[INFO] SMS sent:", response.data);
    return response.data;
  } catch (err) {
    console.error("[ERROR] sendSMS failed:", err.message);
  }
};

module.exports = { sendSMS };
