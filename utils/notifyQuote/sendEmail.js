// utils/notifyQuote/sendEmail.js
const nodemailer = require("nodemailer");

/**
 * Send Email using Nodemailer
 * @param {Object} options - { to, subject, text, html }
 */
const sendEmail = async (options) => {
  try {
    if (!options.to) throw new Error("Recipient email is required");

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"Horsehipt" <${process.env.SMTP_USER}>`,
      ...options,
    });

    console.log("[INFO] Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("[ERROR] sendEmail failed:", err.message);
  }
};

module.exports = { sendEmail };
