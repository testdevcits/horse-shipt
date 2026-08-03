const nodemailer = require("nodemailer");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");

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
      html: baseTemplate({
        title: "HorseShipt Email Verification",
        preheader: "Use this one-time code to finish creating your account.",
        body: `
          <p style="margin:0 0 12px;">Use this one-time code to finish creating your account.</p>
          <div style="display:inline-block;margin:16px 0 8px;padding:14px 20px;background:#fff8ea;border:1px dashed #BF9B53;color:#BF9B53;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;">${escapeHtml(otp)}</div>
          <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">This OTP is valid for 5 minutes.</p>
        `,
        note: "If you did not request this, you can safely ignore this email.",
      }),
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
      html: baseTemplate({
        title: "HorseShipt Password Reset",
        preheader: "Use this one-time code to reset your password.",
        body: `
          <p style="margin:0 0 12px;">Use this one-time code to reset your password.</p>
          <div style="display:inline-block;margin:16px 0 8px;padding:14px 20px;background:#fff8ea;border:1px dashed #BF9B53;color:#BF9B53;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;">${escapeHtml(otp)}</div>
          <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">This OTP is valid for 5 minutes.</p>
        `,
        note: "If you did not request this, you can safely ignore this email.",
      }),
    });
  } catch (error) {
    console.error("PASSWORD RESET OTP MAIL ERROR:", error.message);
    throw error;
  }
};
