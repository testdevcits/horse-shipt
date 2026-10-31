const { chatLog } = require("./chatDiagnostics");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const Customer = require("../models/customer/customerModel");
const Shipper = require("../models/shipper/shipperModel");
const CustomerShipment = require("../models/customer/CustomerShipment");
const { sendCustomerNotification } = require("./customerNotifications");
const { sendShipperEmail } = require("./shipperMailSend");
const { sendShipperSms } = require("./shipperSmsSend");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");
const {
  getShipperChannelSettings,
  isCustomerNotificationEnabled,
} = require("./notificationPreferences");

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
    html: baseTemplate({
      title: subject || "HorseShipt Notification",
      preheader: text,
      body: `<p style="margin:0;">${escapeHtml(text || "").replace(/\n/g, "<br/>")}</p>`,
    }),
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
  const enabled = await isCustomerNotificationEnabled(customerId, "newMessage");
  if (!enabled) {
    chatLog("notification.skipped", { role: "customer", userId: customerId, reason: "preferences" });
    return;
  }

  const customer = await Customer.findById(customerId).select("email phone").lean();
  if (!customer) return;

  const results = await Promise.allSettled([
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
  results.forEach((result, index) => chatLog("notification.channel.result", {
    role: "customer", userId: customerId, channel: ["push", "email", "sms"][index],
    outcome: result.status === "rejected" ? "failed" : result.value === false ? "skipped" : "completed",
    errorCode: result.reason?.code,
  }));
};

const notifyShipper = async ({ shipperId, title, emailText, smsText }) => {
  const messageSettings = await getShipperChannelSettings(shipperId, "message");

  const tasks = [];
  if (messageSettings.email) {
    tasks.push(sendShipperEmail(shipperId, title, emailText));
  }
  if (messageSettings.sms) {
    tasks.push(sendShipperSms(shipperId, smsText));
  }

  const results = await Promise.allSettled(tasks);
  chatLog("notification.shipper.tasks.settled", { userId: shipperId, emailEnabled: messageSettings.email, smsEnabled: messageSettings.sms, tasks: results.length, rejected: results.filter((result) => result.status === "rejected").length });
};

const notifyChatReceiver = async ({
  receiverRole,
  receiverId,
  senderRole,
  messageText,
  shipmentId,
}) => {
  try {
    chatLog("notification.start", { receiverRole, receiverId, shipmentId });
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
    chatLog("notification.failed", { receiverRole, receiverId, shipmentId, errorCode: error.code });
    console.error("Chat notification error:", error.message);
  }
};

const notifyQuestionReceiver = async ({
  receiverRole,
  receiverId,
  senderRole,
  shipmentId,
  action,
  text,
}) => {
  try {
    const senderLabel = senderRole === "customer" ? "Customer" : "Shipper";
    const shipmentLabel = await getShipmentLabel(shipmentId);
    const preview = text || (action === "answered" ? "Answered" : "Question");
    const title =
      action === "answered"
        ? `Question answered for ${shipmentLabel}`
        : `New shipment question for ${shipmentLabel}`;
    const body =
      action === "answered"
        ? `${senderLabel} answered your question: ${preview}`
        : `${senderLabel} asked a question: ${preview}`;
    const emailText =
      action === "answered"
        ? `${senderLabel} answered your question for ${shipmentLabel}.\n\n${preview}`
        : `${senderLabel} asked a question about ${shipmentLabel}.\n\n${preview}`;
    const smsText =
      action === "answered"
        ? `${senderLabel} answered your question for ${shipmentLabel}: ${preview}`
        : `${senderLabel} asked about ${shipmentLabel}: ${preview}`;

    if (receiverRole === "customer") {
      const enabled = await isCustomerNotificationEnabled(receiverId, "question");
      if (!enabled) return;

      const customer = await Customer.findById(receiverId)
        .select("email phone")
        .lean();
      if (!customer) return;

      await Promise.allSettled([
        sendCustomerNotification(receiverId, "question", { title, body }),
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
      return;
    }

    if (receiverRole === "shipper") {
      const questionSettings = await getShipperChannelSettings(
        receiverId,
        "question"
      );

      const tasks = [];
      if (questionSettings.email) {
        tasks.push(sendShipperEmail(receiverId, title, emailText));
      }
      if (questionSettings.sms) {
        tasks.push(sendShipperSms(receiverId, smsText));
      }

      await Promise.allSettled(tasks);
    }
  } catch (error) {
    console.error("Question notification error:", error.message);
  }
};

module.exports = { notifyChatReceiver, notifyQuestionReceiver };
