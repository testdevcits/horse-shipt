const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");

const sendQuoteEmail = async (shipperId, subject, data) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper || !shipper.email) {
      console.warn("[QUOTE MAIL] No valid email for shipper:", shipperId);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const html = baseTemplate({
      title: "Quote Sent Successfully",
      preheader: `Shipment ${data?.shipmentCode || ""} quote was sent.`,
      buttonText: "View Dashboard",
      buttonUrl: process.env.FRONTEND_URL,
      body: `
        <p>Hello <strong>${escapeHtml(shipper.name || "Shipper")}</strong>,</p>
        <p>Your quote has been sent to the customer. We will notify you when they respond.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
          <tr><td style="padding:12px;"><strong>Shipment Code:</strong> ${escapeHtml(data?.shipmentCode || "N/A")}</td></tr>
          <tr><td style="padding:0 12px 12px;"><strong>Total Price:</strong> ${escapeHtml(data?.currency || "USD")} ${escapeHtml(data?.totalPrice || 0)}</td></tr>
          <tr><td style="padding:0 12px 12px;"><strong>Pickup Time:</strong> ${escapeHtml(data?.pickupTime || "-")}</td></tr>
          <tr><td style="padding:0 12px 12px;"><strong>Estimated Arrival:</strong> ${escapeHtml(data?.estimatedArrivalTime || "-")}</td></tr>
        </table>
      `,
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: shipper.email,
      subject: subject || "Quote Sent Successfully - Horse Shipt",
      html,
    });

  } catch (error) {
    console.error("[QUOTE MAIL ERROR]", error.message);
  }
};

module.exports = { sendQuoteEmail };
