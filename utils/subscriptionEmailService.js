const nodemailer = require("nodemailer");
const Shipper = require("../models/shipper/shipperModel");

/**
 * ============================
 * SEND SUBSCRIPTION EMAIL
 * ============================
 */
const sendSubscriptionEmail = async ({
  shipperId,
  planName,
  amount,
  trialEnd,
}) => {
  try {
    const shipper = await Shipper.findById(shipperId);

    if (!shipper || !shipper.email) {
      console.warn("No valid email for shipper:", shipperId);
      return;
    }

    // ============================
    // TRANSPORTER
    // ============================
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // ============================
    // SUBJECT
    // ============================
    const subject = "Subscription Activated";

    // ============================
    // HTML TEMPLATE
    // ============================
    const html = `
      <div style="font-family: Arial, sans-serif; background:#f9fafb; padding:20px;">
        <div style="max-width:600px;margin:auto;background:white;border-radius:10px;padding:24px;border:1px solid #eee;">
          
          <h2 style="color:#BF9B53;margin-bottom:10px;">
            Subscription Activated
          </h2>

          <p style="color:#333;font-size:14px;">
            Hello <strong>${shipper.name || "Shipper"}</strong>,
          </p>

          <p style="color:#555;font-size:14px;">
            Your subscription has been successfully activated.
          </p>

          <div style="margin:20px 0;padding:16px;background:#f8f8f8;border-radius:8px;">
            <p style="margin:5px 0;"><strong>Plan:</strong> ${planName}</p>
            <p style="margin:5px 0;"><strong>Amount:</strong> $${amount}</p>
            ${
              trialEnd
                ? `<p style="margin:5px 0;"><strong>Trial Ends:</strong> ${new Date(
                    trialEnd
                  ).toDateString()}</p>`
                : ""
            }
          </div>

          <p style="color:#555;font-size:14px;">
            You can now enjoy all premium features of HorseShipt
          </p>

          <div style="margin-top:25px;">
            <a href="${process.env.FRONTEND_URL}" 
              style="background:#BF9B53;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-size:14px;">
              Go to Dashboard
            </a>
          </div>

          <p style="margin-top:30px;font-size:12px;color:#999;">
            If you have any questions, feel free to contact support.
          </p>

        </div>
      </div>
    `;

    // ============================
    // SEND MAIL
    // ============================
    await transporter.sendMail({
      from: `"HorseShipt" <${process.env.SMTP_USER}>`,
      to: shipper.email,
      subject,
      html,
    });

    console.log(`Subscription email sent to ${shipper.email}`);
  } catch (error) {
    console.error("Subscription email error:", error);
  }
};

module.exports = { sendSubscriptionEmail };
