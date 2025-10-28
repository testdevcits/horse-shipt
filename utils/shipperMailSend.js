const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");

/**
 * Send email to a shipper by ID
 * @param {ObjectId} shipperId - Shipper's MongoDB ID
 * @param {String} subject - Email subject
 * @param {String} text - Email body text
 */
const sendShipperEmail = async (shipperId, subject, text) => {
  try {
    const shipper = await Shipper.findById(shipperId);
    if (!shipper || !shipper.email) {
      console.warn("No valid email for shipper:", shipperId);
      return;
    }

    // Configure transporter using .env SMTP details
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true", // false for TLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Send mail
    await transporter.sendMail({
      from: `"Load Management" <${process.env.SMTP_USER}>`,
      to: shipper.email,
      subject,
      text,
    });

    console.log(`Email sent successfully to ${shipper.email}`);
  } catch (error) {
    console.error("Error sending shipper email:", error);
  }
};

module.exports = { sendShipperEmail };
