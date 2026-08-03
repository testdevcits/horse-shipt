const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");
const { getFrontendUrl } = require("./frontendUrl");
const {
  baseTemplate,
  detailTable,
  escapeHtml,
} = require("./mailTemplates/baseTemplate");

const sendSubscriptionEmail = async ({
  shipperId,
  planName,
  amount,
  trialEnd,
}) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper || !shipper.email) return;

    // ============================
    // GMAIL SMTP CONFIG (FIXED)
    // ============================
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, // smtp.gmail.com
      port: Number(process.env.EMAIL_PORT), // 465
      secure: true, // IMPORTANT for 465
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const html = baseTemplate({
      title: "Subscription Activated",
      preheader: "Your HorseShipt subscription is now active.",
      buttonText: "Go to Dashboard",
      buttonUrl: getFrontendUrl(),
      body: `
        <p style="margin:0 0 10px;">Hello <strong>${escapeHtml(
          shipper.name || "Shipper"
        )}</strong>,</p>
        <p style="margin:0;">Your subscription is now active on HorseShipt.</p>
        ${detailTable([
          { label: "Plan", value: escapeHtml(planName || "N/A") },
          { label: "Amount", value: `$${escapeHtml(amount ?? "0")}` },
          trialEnd
            ? {
                label: "Trial Ends",
                value: escapeHtml(new Date(trialEnd).toDateString()),
              }
            : null,
        ])}
      `,
      note: "Thanks for keeping your HorseShipt account active.",
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: shipper.email,
      subject: "Subscription Activated - Horse Shipt",
      html,
    });
  } catch (error) {
    console.error("Email error:", error.message);
  }
};

module.exports = { sendSubscriptionEmail };
