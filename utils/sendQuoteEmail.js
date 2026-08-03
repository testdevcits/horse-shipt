const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");
const {
  baseTemplate,
  detailTable,
  escapeHtml,
} = require("./mailTemplates/baseTemplate");
const { getFrontendUrl } = require("./frontendUrl");

const sendQuoteEmail = async (shipperId, subject, data) => {
  try {
    const payload =
      data && typeof data === "object"
        ? data
        : { message: data };

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
      preheader: `Shipment ${payload?.shipmentCode || ""} quote was sent.`,
      buttonText: "View Dashboard",
      buttonUrl: getFrontendUrl(),
      body: `
        <p style="margin:0 0 10px;">Hello <strong>${escapeHtml(shipper.name || "Shipper")}</strong>,</p>
        <p style="margin:0;">Your quote has been sent to the customer. We will notify you when they respond.</p>
        ${detailTable([
          { label: "Shipment Code", value: escapeHtml(payload?.shipmentCode || "N/A") },
          payload?.customerName
            ? { label: "Customer", value: escapeHtml(payload.customerName) }
            : null,
          payload?.pickupLocation
            ? { label: "Pickup", value: escapeHtml(payload.pickupLocation) }
            : null,
          payload?.deliveryLocation
            ? { label: "Delivery", value: escapeHtml(payload.deliveryLocation) }
            : null,
          {
            label: "Total Price",
            value: `${escapeHtml(payload?.currency || "USD")} ${escapeHtml(payload?.totalPrice || 0)}`,
          },
          payload?.paymentMethod
            ? { label: "Payment Method", value: escapeHtml(payload.paymentMethod) }
            : null,
          payload?.paymentDue
            ? { label: "Payment Due", value: escapeHtml(payload.paymentDue) }
            : null,
        ])}
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
