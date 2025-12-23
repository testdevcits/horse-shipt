// utils/sendQuoteEmail.js
const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");

/**
 * Send email to a shipper specifically for quotes
 * @param {ObjectId} shipperId - Shipper's MongoDB ID
 * @param {String} subject - Email subject
 * @param {String} text - Email body text
 */
const sendQuoteEmail = async (shipperId, subject, text) => {
  try {
    const shipper = await Shipper.findById(shipperId);
    if (!shipper || !shipper.email) {
      console.warn("[QUOTE MAIL] No valid email for shipper:", shipperId);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to: shipper.email,
      subject,
      text,
    });

    console.log(
      `[QUOTE MAIL] Email sent to ${shipper.email} with subject: "${subject}"`
    );
  } catch (error) {
    console.error("[QUOTE MAIL ERROR] Failed to send email:", error);
  }
};

module.exports = { sendQuoteEmail };
