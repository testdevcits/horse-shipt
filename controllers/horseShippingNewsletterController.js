// controllers/horseShippingNewsletterController.js

const HorseShippingNewsletter = require("../models/Newsletter");
const crypto = require("crypto");
const transporter = require("../utils/transporter"); // Reusable transporter
const nodemailer = require("nodemailer");

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

    console.log("[INFO] Email sent to:", email);
  } catch (error) {
    console.error("[ERROR] Email error:", error.message);
    throw error;
  }
};

// ================= Subscribe Newsletter =================
exports.subscribeNewsletter = async (req, res) => {
  try {
    console.log("[DEBUG] subscribeNewsletter called", req.body);

    const { email } = req.body;
    if (!email) {
      console.log("[DEBUG] No email provided");
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const existingUser = await HorseShippingNewsletter.findOne({ email });
    console.log("[DEBUG] Existing user:", existingUser);

    if (existingUser && existingUser.isVerified) {
      console.log("[DEBUG] Email already verified");
      return res
        .status(400)
        .json({ success: false, message: "Email already subscribed" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    console.log("[DEBUG] Generated token and expiry:", token, expiry);

    let user;
    if (existingUser) {
      existingUser.verificationToken = token;
      existingUser.tokenExpiry = expiry;
      user = await existingUser.save();
      console.log("[DEBUG] Updated existing user:", user);
    } else {
      user = await HorseShippingNewsletter.create({
        email,
        verificationToken: token,
        tokenExpiry: expiry,
      });
      console.log("[DEBUG] Created new user:", user);
    }

    const verifyLink = `${process.env.FRONTEND_URL}/verify?token=${token}`;
    console.log("[DEBUG] Verification link:", verifyLink);

    await sendEmail({ email, link: verifyLink });
    console.log("[DEBUG] Email sent successfully");

    return res
      .status(200)
      .json({ success: true, message: "Verification email sent successfully" });
  } catch (error) {
    console.error("[ERROR] Subscribe Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= Verify Email =================
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token)
      return res.status(400).json({ success: false, message: "Token missing" });

    const user = await HorseShippingNewsletter.findOne({
      verificationToken: token,
    });

    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });

    if (user.tokenExpiry < new Date())
      return res.status(401).json({ success: false, message: "Token expired" });

    user.isVerified = true;
    user.verificationToken = null;
    user.tokenExpiry = null;
    await user.save();

    return res
      .status(200)
      .json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    console.error("[ERROR] Verify Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
    console.error("[ERROR] Fetch Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= Delete Subscriber =================
// ================= Delete Subscriber =================
exports.deleteSubscriber = async (req, res) => {
  try {
    console.log("[DEBUG] deleteSubscriber called");
    console.log("[DEBUG] req.params:", req.params);
    console.log("[DEBUG] req.body:", req.body);

    const { id } = req.params;
    const { ids } = req.body || {}; // Safe destructure

    // If multiple IDs provided in body
    if (ids && Array.isArray(ids) && ids.length > 0) {
      console.log("[DEBUG] Deleting multiple subscribers:", ids);

      const result = await HorseShippingNewsletter.deleteMany({
        _id: { $in: ids },
      });

      console.log("[DEBUG] deleteMany result:", result);

      if (result.deletedCount === 0) {
        console.log("[DEBUG] No subscribers found to delete for provided IDs");
        return res
          .status(404)
          .json({ success: false, message: "No subscribers found to delete" });
      }

      console.log(
        `[DEBUG] Successfully deleted ${result.deletedCount} subscriber(s)`
      );
      return res.status(200).json({
        success: true,
        message: `${result.deletedCount} subscriber(s) deleted successfully`,
      });
    }

    // If single ID provided in params
    if (id) {
      console.log("[DEBUG] Deleting single subscriber with ID:", id);
      const user = await HorseShippingNewsletter.findByIdAndDelete(id);

      if (!user) {
        console.log("[DEBUG] Subscriber not found for ID:", id);
        return res
          .status(404)
          .json({ success: false, message: "Subscriber not found" });
      }

      console.log("[DEBUG] Subscriber deleted successfully:", user.email);
      return res
        .status(200)
        .json({ success: true, message: "Subscriber deleted successfully" });
    }

    // If neither ID nor ids array provided
    console.log("[DEBUG] No subscriber ID(s) provided in params or body");
    return res
      .status(400)
      .json({ success: false, message: "No subscriber ID(s) provided" });
  } catch (error) {
    console.error("[ERROR] Delete Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Send newsletter to all verified subscribers (or provided recipients)
// @route   POST /admin/horse-newsletter/send
// @access  Private (Admin)

exports.sendNewsletter = async (req, res) => {
  try {
    console.log("[DEBUG] sendNewsletter called");
    console.log("[DEBUG] Request body:", req.body);

    const { subject, message, htmlContent, recipients } = req.body;

    // --- Validation ---
    if (!subject || subject.trim() === "") {
      console.log("[DEBUG] Validation failed: Subject missing");
      return res
        .status(400)
        .json({ success: false, message: "Subject is required" });
    }

    if (!message && !htmlContent) {
      console.log("[DEBUG] Validation failed: No message or HTML content");
      return res.status(400).json({
        success: false,
        message: "Message or HTML content is required",
      });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      console.log("[DEBUG] Validation failed: No recipients provided");
      return res
        .status(400)
        .json({ success: false, message: "No recipients provided" });
    }

    console.log(
      `[DEBUG] Sending newsletter to ${recipients.length} recipients`
    );

    // --- Setup Nodemailer Transporter ---
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, // e.g., smtp.gmail.com
      port: parseInt(process.env.EMAIL_PORT) || 465,
      secure: true, // true for 465
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    console.log("[DEBUG] Nodemailer transporter configured");

    // --- Send emails in parallel ---
    const results = await Promise.allSettled(
      recipients.map((email) => {
        console.log(`[DEBUG] Sending email to: ${email}`);
        return transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: email,
          subject: subject.trim(),
          text: message || "",
          html: htmlContent || `<p>${message}</p>`,
        });
      })
    );

    // --- Count successes and failures ---
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    console.log(`[DEBUG] Emails succeeded: ${succeeded.length}`);
    console.log(`[DEBUG] Emails failed: ${failed.length}`);

    if (failed.length > 0) {
      console.error(
        "[DEBUG] Failed email details:",
        failed.map((f) => f.reason)
      );
    }

    return res.status(200).json({
      success: true,
      message: `Newsletter sent to ${succeeded.length} subscriber(s)`,
      sentCount: succeeded.length,
      failedCount: failed.length,
    });
  } catch (error) {
    console.error("[ERROR] Send newsletter error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while sending newsletter",
      error: error.message,
    });
  }
};
