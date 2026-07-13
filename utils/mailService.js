const nodemailer = require("nodemailer");

// -------------------- TRANSPORTER (USE WORKING SMTP CONFIG) --------------------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
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
    await transporter.sendMail({
      from:
        process.env.EMAIL_FROM || `"HorseShipt" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify your HorseShipt email",
      html: `
<div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:28px;">
  <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:14px;border:1px solid #eadfca;overflow:hidden;">
    <div style="background:#BF9B53;color:#fff;padding:22px 24px;text-align:center;">
      <h2 style="margin:0;font-size:22px;">HorseShipt Email Verification</h2>
    </div>
    <div style="padding:28px 24px;text-align:center;color:#1f2937;">
      <p style="font-size:15px;margin:0 0 10px;">Use this one-time code to finish creating your account.</p>
      <div style="display:inline-block;font-size:34px;letter-spacing:8px;font-weight:800;color:#BF9B53;background:#fff8ea;border:1px dashed #BF9B53;border-radius:12px;padding:14px 18px;margin:18px 0;">
        ${otp}
      </div>
      <p style="font-size:13px;color:#6b7280;margin:8px 0 0;">This OTP is valid for 5 minutes.</p>
      <p style="font-size:12px;color:#9ca3af;margin:18px 0 0;">If you did not request this, you can safely ignore this email.</p>
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

// -------------------- SEND PASSWORD RESET OTP MAIL --------------------
exports.sendPasswordResetOtpMail = async (email, otp) => {
  try {
    await transporter.sendMail({
      from:
        process.env.EMAIL_FROM || `"HorseShipt" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "HorseShipt password reset OTP",
      html: `
<div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:28px;">
  <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:14px;border:1px solid #eadfca;overflow:hidden;">
    <div style="background:#BF9B53;color:#fff;padding:22px 24px;text-align:center;">
      <h2 style="margin:0;font-size:22px;">HorseShipt Password Reset</h2>
    </div>
    <div style="padding:28px 24px;text-align:center;color:#1f2937;">
      <p style="font-size:15px;margin:0 0 10px;">Use this one-time code to reset your password.</p>
      <div style="display:inline-block;font-size:34px;letter-spacing:8px;font-weight:800;color:#BF9B53;background:#fff8ea;border:1px dashed #BF9B53;border-radius:12px;padding:14px 18px;margin:18px 0;">
        ${otp}
      </div>
      <p style="font-size:13px;color:#6b7280;margin:8px 0 0;">This OTP is valid for 5 minutes.</p>
      <p style="font-size:12px;color:#9ca3af;margin:18px 0 0;">If you did not request this, you can safely ignore this email.</p>
    </div>
  </div>
</div>
      `,
    });
  } catch (error) {
    console.error("PASSWORD RESET OTP MAIL ERROR:", error.message);
    throw error;
  }
};
