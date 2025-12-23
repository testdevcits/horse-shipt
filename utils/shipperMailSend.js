const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");

/**
 * Send email to a shipper by ID
 */
const shipperMailSend = async (shipperId, subject, text) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper || !shipper.email) {
      console.warn(
        `[SHIPPER MAIL DEBUG] No valid email for shipper ID: ${shipperId}`
      );
      return;
    }

    console.log(`[SHIPPER MAIL DEBUG] Preparing to send email`);
    console.log(`[SHIPPER MAIL DEBUG] Shipper ID: ${shipperId}`);
    console.log(`[SHIPPER MAIL DEBUG] Shipper Email: ${shipper.email}`);
    console.log(`[SHIPPER MAIL DEBUG] Subject: ${subject}`);
    console.log(`[SHIPPER MAIL DEBUG] Text: ${text}`);
    console.log(`[SHIPPER MAIL DEBUG] SMTP Host: ${process.env.SMTP_HOST}`);
    console.log(`[SHIPPER MAIL DEBUG] SMTP User: ${process.env.SMTP_USER}`);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to: shipper.email,
      subject,
      text,
    });

    console.log(`[SHIPPER MAIL DEBUG] Email sent successfully`);
    console.log(`[SHIPPER MAIL DEBUG] Message ID: ${info.messageId}`);
    console.log(`[SHIPPER MAIL DEBUG] Response: ${info.response}`);
  } catch (error) {
    console.error(
      `[SHIPPER MAIL ERROR] Error sending email to shipper ID: ${shipperId}`,
      error
    );
  }
};

module.exports = shipperMailSend;
