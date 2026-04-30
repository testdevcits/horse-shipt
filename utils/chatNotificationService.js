const nodemailer = require("nodemailer");
const twilio = require("twilio");
const Customer = require("../models/customer/customerModel");
const Shipper = require("../models/shipper/shipperModel");
const CustomerNotification = require("../models/customer/CustomerNotificationModel");
const ShipperSettings = require("../models/shipper/shipperSettingsModel");
const CustomerShipment = require("../models/customer/CustomerShipment");
const { sendCustomerNotification } = require("./customerNotifications");
const { sendShipperEmail } = require("./shipperMailSend");
const { sendShipperSms } = require("./shipperSmsSend");

const isValidE164 = (phone = "") => /^\+[1-9]\d{9,14}$/.test(phone);

const getTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendCustomerEmail = async ({ to, subject, text }) => {
  const transporter = getTransporter();
  if (!transporter || !to) return false;

  await transporter.sendMail({
    from: `"HorseShipt" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });

  return true;
};

const sendCustomerSms = async ({ to, body }) => {
  if (
    !isValidE164(to) ||
    !process.env.TWILIO_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE
  ) {
    return false;
  }

  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    from: process.env.TWILIO_PHONE,
    to,
    body,
  });

  return true;
};

const getShipmentLabel = async (shipmentId) => {
  if (!shipmentId) return "your shipment";

  const shipment = await CustomerShipment.findById(shipmentId)
    .select("shipmentCode")
    .lean();

  return shipment?.shipmentCode || "your shipment";
};

const notifyCustomer = async ({ customerId, title, body, emailText, smsText }) => {
  const settings =
    (await CustomerNotification.findOne({ user: customerId })) ||
    (await CustomerNotification.create({ user: customerId }));

  if (settings.settings?.newMessage === false) return;

  const customer = await Customer.findById(customerId).select("email phone").lean();
  if (!customer) return;

  await Promise.allSettled([
    sendCustomerNotification(customerId, "newMessage", { title, body }),
    sendCustomerEmail({
      to: customer.email,
      subject: title,
      text: emailText,
    }),
    sendCustomerSms({
      to: customer.phone,
      body: smsText,
    }),
  ]);
};

const notifyShipper = async ({ shipperId, title, emailText, smsText }) => {
  const settings =
    (await ShipperSettings.findOne({ shipperId })) ||
    (await ShipperSettings.create({ shipperId }));

  const messageSettings = settings.notifications?.message || {
    email: true,
    sms: true,
  };

  const tasks = [];
  if (messageSettings.email) {
    tasks.push(sendShipperEmail(shipperId, title, emailText));
  }
  if (messageSettings.sms) {
    tasks.push(sendShipperSms(shipperId, smsText));
  }

  await Promise.allSettled(tasks);
};

const notifyChatReceiver = async ({
  receiverRole,
  receiverId,
  senderRole,
  messageText,
  shipmentId,
}) => {
  try {
    const senderLabel = senderRole === "customer" ? "Customer" : "Shipper";
    const shipmentLabel = await getShipmentLabel(shipmentId);
    const preview = messageText || "Image";
    const title = `New chat message for ${shipmentLabel}`;
    const body = `${senderLabel}: ${preview}`;
    const emailText = `${senderLabel} sent you a chat message for ${shipmentLabel}.\n\n${preview}`;
    const smsText = `${senderLabel} sent a message for ${shipmentLabel}: ${preview}`;

    if (receiverRole === "customer") {
      await notifyCustomer({
        customerId: receiverId,
        title,
        body,
        emailText,
        smsText,
      });
      return;
    }

    if (receiverRole === "shipper") {
      const shipper = await Shipper.findById(receiverId).select("_id").lean();
      if (!shipper) return;

      await notifyShipper({
        shipperId: receiverId,
        title,
        emailText,
        smsText,
      });
    }
  } catch (error) {
    console.error("Chat notification error:", error.message);
  }
};

module.exports = { notifyChatReceiver };
