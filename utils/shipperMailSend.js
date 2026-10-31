const { chatLog } = require("./chatDiagnostics");
const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");
const { getFrontendUrl } = require("./frontendUrl");

/**
 * Send email to a shipper by ID
 * @param {ObjectId} shipperId - Shipper's MongoDB ID
 * @param {String} subject - Email subject
 * @param {String} text - Email body text
 */
const sendShipperEmail = async (shipperId, subject, text) => {
  try {
    chatLog("notification.channel.start", { role: "shipper", userId: shipperId, channel: "email" });
    const shipper = await Shipper.findById(shipperId);
    if (!shipper || !shipper.email) {
      console.warn("No valid email for shipper:", shipperId);
      chatLog("notification.channel.skipped", { role: "shipper", userId: shipperId, channel: "email", reason: "missing_recipient" });
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
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to: shipper.email,
      subject,
      text,
      html: baseTemplate({
        title: subject || "Horse Shipt Notification",
        preheader: text,
        body: `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`,
        buttonText: "Open Horse Shipt",
        buttonUrl: getFrontendUrl(),
      }),
    });
    chatLog("notification.channel.sent", { role: "shipper", userId: shipperId, channel: "email" });
  } catch (error) {
    chatLog("notification.channel.failed", { role: "shipper", userId: shipperId, channel: "email", errorCode: error.code, status: error.status });
    console.error("Error sending shipper email:", error);
  }
};

module.exports = { sendShipperEmail };
