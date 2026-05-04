const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  try {
    if (!options.to) throw new Error("Recipient email is required");

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: true, // 465 uses SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM, // use EMAIL_FROM
      ...options,
    });
    return info;
  } catch (err) {
    console.error("[ERROR] sendEmail failed:", err.message);
  }
};

module.exports = { sendEmail };
