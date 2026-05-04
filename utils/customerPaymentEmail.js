const nodemailer = require("nodemailer");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");

const sendCustomerPaymentEmail = async (to, subject, text, html = null) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.verify();

    const mailOptions = {
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html:
        html ||
        baseTemplate({
          title: subject || "Payment Verification",
          preheader: text,
          body: `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`,
        }),
    };

    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("[CUSTOMER PAYMENT EMAIL] Error:", err);
    throw err; // throw so API can handle it
  }
};

module.exports = sendCustomerPaymentEmail;
