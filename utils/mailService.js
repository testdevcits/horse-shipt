const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendOtpMail = async (email, otp) => {
  await transporter.sendMail({
    from: process.env.EMAIL,
    to: email,
    subject: "Verify Your Account - OTP",
    html: `
<div style="font-family: Arial, sans-serif; background:#f9fafb; padding:20px;">
 
  <div style="
    max-width:600px;
    margin:auto;
    background:#ffffff;
    border-radius:10px;
    overflow:hidden;
    border:1px solid #BF9B53;
    box-shadow:0 4px 20px rgba(0,0,0,0.08);
  ">
 
    <!-- HEADER -->
    <div style="background:#BF9B53; color:#ffffff; padding:20px; text-align:center;">
      <h2 style="margin:0; font-size:20px;">Email Verification</h2>
    </div>
 
    <!-- CONTENT -->
    <div style="padding:24px;">
 
      <p style="font-size:14px; color:#333; margin-bottom:10px;">
        Hello,
      </p>
 
      <p style="font-size:14px; color:#555;">
        Thank you for signing up with <strong>Horse Shipt</strong>.
      </p>

      <p style="font-size:14px; color:#555;">
        Please use the OTP below to verify your email address:
      </p>
 
      <!-- OTP BOX -->
      <div style="
        margin-top:20px;
        border:1px solid #BF9B53;
        border-radius:8px;
        overflow:hidden;
        text-align:center;
      ">
        
        <div style="background:#f8f8f8; padding:12px; font-weight:bold; color:#333;">
          Your OTP Code
        </div>
 
        <div style="
          padding:20px;
          font-size:28px;
          letter-spacing:6px;
          font-weight:bold;
          color:#BF9B53;
        ">
          ${otp}
        </div>
      </div>
 
      <!-- NOTE -->
      <p style="font-size:12px; color:#777; line-height:1.5; margin-top:20px;">
        This OTP will expire in 5 minutes. Do not share this code with anyone.
      </p>
 
    </div>
 
    <!-- FOOTER -->
    <div style="background:#f1f1f1; text-align:center; padding:12px; font-size:12px; color:#666;">
      <p style="margin:0;">© ${new Date().getFullYear()} Horse Shipt</p>
    </div>
 
  </div>
</div>
    `,
  });
};
