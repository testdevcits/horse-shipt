const nodemailer = require("nodemailer");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");

const sendDeliveryMail = async (to, subject, message) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"HorseShipt" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      text: message,
      html: baseTemplate({
        title: subject || "HorseShipt Delivery Update",
        preheader: message,
        body: `<p style="margin:0;">${escapeHtml(message || "").replace(/\n/g, "<br/>")}</p>`,
      }),
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Delivery Mail Error:", error);
  }
};

module.exports = sendDeliveryMail;
