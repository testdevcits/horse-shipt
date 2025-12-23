const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");

const sendShipperEmail = async (shipperId, subject, text) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper || !shipper.email) {
      console.warn(
        `[SHIPPER MAIL DEBUG] No valid email for shipper ID: ${shipperId}`
      );
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

    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to: shipper.email,
      subject,
      text,
    });

    console.log(
      `[SHIPPER MAIL DEBUG] Email sent successfully: ${info.messageId}`
    );
  } catch (error) {
    console.error(
      `[SHIPPER MAIL ERROR] Error sending email to shipper ID: ${shipperId}`,
      error
    );
  }
};

module.exports = { sendShipperEmail };
