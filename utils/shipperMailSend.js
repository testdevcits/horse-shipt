const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");

/**
 * Send email to a shipper by ID
 */
const shipperMailSend = async (shipperId, subject, text) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper || !shipper.email) {
      console.warn("No valid email for shipper:", shipperId);
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

    console.log(`Email sent to ${shipper.email}`);
  } catch (error) {
    console.error("Error sending shipper email:", error);
  }
};

module.exports = shipperMailSend;
