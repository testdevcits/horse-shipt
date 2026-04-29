const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");

const sendSubscriptionEmail = async ({
  shipperId,
  planName,
  amount,
  trialEnd,
}) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper || !shipper.email) return;

    // ============================
    // GMAIL SMTP CONFIG (FIXED)
    // ============================
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, // smtp.gmail.com
      port: Number(process.env.EMAIL_PORT), // 465
      secure: true, // IMPORTANT for 465
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const html = `
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial, sans-serif;">
  <div style="padding:20px;">
    <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;border:1px solid #eee;overflow:hidden;">
      
      <!-- HEADER -->
      <div style="background:#BF9B53;padding:18px;text-align:center;">
        <h2 style="color:white;margin:0;">Horse Shipt</h2>
      </div>

      <!-- CONTENT -->
      <div style="padding:24px;">

        <p style="font-size:14px;color:#333;">
          Hello <strong>${shipper.name || "Shipper"}</strong>,
        </p>

        <p style="font-size:14px;color:#555;">
          Your subscription is now active on <strong>Horse Shipt</strong>.
        </p>

        <div style="margin:20px 0;padding:16px;background:#f8f8f8;border-radius:8px;">
          <h4 style="margin:0 0 10px 0;">Subscription Summary</h4>
          <p><strong>Plan:</strong> ${planName}</p>
          <p><strong>Amount:</strong> $${amount}</p>
          ${
            trialEnd
              ? `<p><strong>Trial Ends:</strong> ${new Date(
                  trialEnd
                ).toDateString()}</p>`
              : ""
          }
        </div>

        <div style="margin:20px 0;">
          <a href="${process.env.FRONTEND_URL}"
             style="background:#BF9B53;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;">
            Go to Dashboard
          </a>
        </div>

        <p style="font-size:14px;color:#333;">
          Thanks,<br/>
          <strong>Horse Shipt Team</strong>
        </p>

      </div>

      <div style="background:#f1f1f1;text-align:center;padding:10px;font-size:12px;">
        © ${new Date().getFullYear()} Horse Shipt
      </div>

    </div>
  </div>
</body>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: shipper.email,
      subject: "Subscription Activated - Horse Shipt",
      html,
    });

    console.log("Subscription email sent to:", shipper.email);
  } catch (error) {
    console.error("Email error:", error.message);
  }
};

module.exports = { sendSubscriptionEmail };
