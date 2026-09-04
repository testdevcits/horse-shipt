const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");
const {
  baseTemplate,
  detailTable,
  escapeHtml,
} = require("./mailTemplates/baseTemplate");
const { getFrontendUrl } = require("./frontendUrl");

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

const formatPrice = (payload = {}) =>
  `${escapeHtml(payload?.currency || "USD")} ${escapeHtml(payload?.totalPrice || 0)}`;

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

    const transporter = createTransporter();

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
            value: formatPrice(payload),
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

const sendCustomerQuoteReceivedEmail = async (customer, subject, data) => {
  try {
    if (!customer?.email) {
      console.warn("[QUOTE MAIL] No valid email for customer:", customer?._id);
      return;
    }

    const payload = data && typeof data === "object" ? data : { message: data };
    const quoteUrl = payload?.shipmentId
      ? `${getFrontendUrl()}/customer/my-shipments?shipmentId=${encodeURIComponent(
          payload.shipmentId
        )}&tab=quotes`
      : getFrontendUrl();

    const transporter = createTransporter();
    const html = baseTemplate({
      title: "New Quote Received",
      preheader: `A shipper submitted a quote for shipment ${
        payload?.shipmentCode || ""
      }.`,
      buttonText: "Review Quote",
      buttonUrl: quoteUrl,
      body: `
        <p style="margin:0 0 10px;">Hello <strong>${escapeHtml(customer.name || "Customer")}</strong>,</p>
        <p style="margin:0;">${escapeHtml(payload?.shipperName || "A shipper")} submitted a new quote for your shipment.</p>
        ${detailTable([
          { label: "Shipment Code", value: escapeHtml(payload?.shipmentCode || "N/A") },
          payload?.shipperName
            ? { label: "Shipper", value: escapeHtml(payload.shipperName) }
            : null,
          payload?.pickupLocation
            ? { label: "Pickup", value: escapeHtml(payload.pickupLocation) }
            : null,
          payload?.deliveryLocation
            ? { label: "Delivery", value: escapeHtml(payload.deliveryLocation) }
            : null,
          {
            label: "Total Price",
            value: formatPrice(payload),
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
      to: customer.email,
      subject: subject || "New Quote Received - Horse Shipt",
      html,
    });
  } catch (error) {
    console.error("[CUSTOMER QUOTE MAIL ERROR]", error.message);
  }
};

module.exports = { sendCustomerQuoteReceivedEmail, sendQuoteEmail };
