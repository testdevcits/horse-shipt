const nodemailer = require("nodemailer");

const sendCustomerPaymentEmail = async (to, subject, text, html = null) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_PORT === "465", // true for port 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      ...(html && { html }), // include HTML if provided
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[CUSTOMER PAYMENT EMAIL] Sent: ${info.messageId}`);
  } catch (err) {
    console.error("[CUSTOMER PAYMENT EMAIL] Error:", err);
    throw err;
  }
};

module.exports = sendCustomerPaymentEmail;
