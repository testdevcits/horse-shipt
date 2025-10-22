const nodemailer = require("nodemailer");

const sendCustomerPaymentEmail = async (to, subject, text, html = null) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_PORT === "465", // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Optional: verify SMTP connection
    await transporter.verify();
    console.log("[CUSTOMER PAYMENT EMAIL] SMTP connection successful");

    // Mail options
    const mailOptions = {
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      ...(html && { html }), // add HTML if provided
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log(`[CUSTOMER PAYMENT EMAIL] Sent: ${info.messageId}`);
  } catch (err) {
    console.error("[CUSTOMER PAYMENT EMAIL] Error:", err);
    throw err; // throw so API can handle it
  }
};

module.exports = sendCustomerPaymentEmail;
