const nodemailer = require("nodemailer");

const sendCustomerPaymentEmail = async (to, subject, text) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // true if port 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });
  } catch (err) {
    console.error("[CUSTOMER PAYMENT EMAIL] Error:", err);
    throw err;
  }
};

module.exports = sendCustomerPaymentEmail;
