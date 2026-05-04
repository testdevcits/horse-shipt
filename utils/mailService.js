const nodemailer = require("nodemailer");

// -------------------- TRANSPORTER (USE WORKING SMTP CONFIG) --------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// -------------------- DEBUG --------------------

// -------------------- VERIFY CONNECTION --------------------
transporter.verify((error) => {
  if (error) {
    console.error("SMTP ERROR:", error.message);
  } else {
  }
});

// -------------------- SEND OTP MAIL --------------------
exports.sendOtpMail = async (email, otp) => {
  try {

    const info = await transporter.sendMail({
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Verify Your Account - OTP",
      html: `
<div style="font-family: Arial, sans-serif; background:#f9fafb; padding:20px;">
  <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;border:1px solid #BF9B53;">
    <div style="background:#BF9B53;color:#fff;padding:20px;text-align:center;">
      <h2>Email Verification</h2>
    </div>
    <div style="padding:24px;text-align:center;">
      <p>Hello,</p>
      <p>Use the OTP below to verify your account:</p>
      <div style="font-size:28px;font-weight:bold;color:#BF9B53;margin:20px 0;">
        ${otp}
      </div>
      <p style="font-size:12px;color:#777;">Valid for 5 minutes</p>
    </div>
  </div>
</div>
      `,
    });
  } catch (error) {
    console.error("OTP MAIL ERROR:", error.message);
    throw error;
  }
};
