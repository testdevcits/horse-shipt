// controllers/horseShippingNewsletterController.js

const HorseShippingNewsletter = require("../models/Newsletter");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ================= Nodemailer Transporter =================
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // 465 = true
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ================= Email Template =================
const sendEmail = async ({ email, link }) => {
  try {
    const html = `
    <div style="font-family: Arial, sans-serif; padding:20px; background:#f4f4f4;">
      <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden;">
        <div style="background:#BF9B53; color:#fff; padding:20px; text-align:center;">
          <h2>🐎 Horse Shipping Newsletter</h2>
        </div>
        <div style="padding:25px;">
          <h3>Confirm Your Subscription</h3>
          <p>Thank you for subscribing to horse shipping updates and tips.</p>
          <p>Please click below to verify your email:</p>
          <div style="text-align:center; margin:30px 0;">
            <a href="${link}" 
              style="background:#BF9B53; color:#fff; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:bold;">
              Verify Email
            </a>
          </div>
          <p style="font-size:13px; color:#555;">
            This link expires in 24 hours. If you didn’t request this, ignore this email.
          </p>
        </div>
        <div style="background:#f1f1f1; text-align:center; padding:15px; font-size:12px;">
          © ${new Date().getFullYear()} Horse Shipt
        </div>
      </div>
    </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Verify your email - Horse Shipping Newsletter",
      html,
    });

    console.log("Email sent to:", email);
  } catch (error) {
    console.error("Email error:", error.message);
    throw error;
  }
};

// ================= Subscribe Newsletter =================
exports.subscribeNewsletter = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });

    const existingUser = await HorseShippingNewsletter.findOne({ email });
    if (existingUser && existingUser.isVerified)
      return res
        .status(400)
        .json({ success: false, message: "Email already subscribed" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    let user;
    if (existingUser) {
      existingUser.verificationToken = token;
      existingUser.tokenExpiry = expiry;
      user = await existingUser.save();
    } else {
      user = await HorseShippingNewsletter.create({
        email,
        verificationToken: token,
        tokenExpiry: expiry,
      });
    }

    // Production-ready verify link
    const verifyLink = `${process.env.FRONTEND_URL}/verify?token=${token}`;

    await sendEmail({ email, link: verifyLink });

    return res
      .status(200)
      .json({ success: true, message: "Verification email sent successfully" });
  } catch (error) {
    console.error("Subscribe Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= Verify Email =================
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token)
      return res.redirect(
        `${process.env.FRONTEND_URL}/newsletter-error?msg=token-missing`
      );

    const user = await HorseShippingNewsletter.findOne({
      verificationToken: token,
    });
    if (!user)
      return res.redirect(
        `${process.env.FRONTEND_URL}/newsletter-error?msg=invalid-token`
      );

    if (user.tokenExpiry < new Date())
      return res.redirect(
        `${process.env.FRONTEND_URL}/newsletter-error?msg=token-expired`
      );

    user.isVerified = true;
    user.verificationToken = null;
    user.tokenExpiry = null;
    await user.save();

    // Redirect success
    return res.redirect(`${process.env.FRONTEND_URL}/newsletter-success`);
  } catch (error) {
    console.error("Verify Error:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/newsletter-error?msg=server-error`
    );
  }
};

// ================= Get All Subscribers =================
exports.getAllSubscribers = async (req, res) => {
  try {
    const users = await HorseShippingNewsletter.find().sort({ createdAt: -1 });
    return res
      .status(200)
      .json({ success: true, count: users.length, data: users });
  } catch (error) {
    console.error("Fetch Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= Delete Subscriber =================
exports.deleteSubscriber = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await HorseShippingNewsletter.findByIdAndDelete(id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Subscriber not found" });

    return res
      .status(200)
      .json({ success: true, message: "Subscriber deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
