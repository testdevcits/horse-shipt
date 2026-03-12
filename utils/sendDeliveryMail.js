const nodemailer = require("nodemailer");

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
    };

    await transporter.sendMail(mailOptions);

    console.log("Delivery OTP Email sent");
  } catch (error) {
    console.error("Delivery Mail Error:", error);
  }
};

module.exports = sendDeliveryMail;
