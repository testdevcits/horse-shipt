// controllers/horseShippingNewsletterController.js

const HorseShippingNewsletter = require("../models/Newsletter");
const crypto = require("crypto");
const transporter = require("../utils/transporter"); // Reusable transporter
const nodemailer = require("nodemailer");
const { baseTemplate, escapeHtml } = require("../utils/mailTemplates/baseTemplate");
const { buildPagination, sendPaginated } = require("../utils/adminQuery");

// ================= Email Template =================
const sendEmail = async ({ email, link }) => {
  try {
    const html = baseTemplate({
      title: "Confirm Your Newsletter Subscription",
      preheader: "Verify your email to receive Horse Shipt updates.",
      buttonText: "Verify Email",
      buttonUrl: link,
      body: `
        <p>Thanks for subscribing to Horse Shipt updates.</p>
        <p>Please verify your email address to complete your subscription. This link expires in 24 hours.</p>
      `,
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Verify your email - Horse Shipping Newsletter",
      html,
    });
  } catch (error) {
    console.error("[ERROR] Email error:", error.message);
    throw error;
  }
};

// ================= Subscribe Newsletter =================
exports.subscribeNewsletter = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const existingUser = await HorseShippingNewsletter.findOne({ email });

    if (existingUser && existingUser.isVerified) {
      return res
        .status(400)
        .json({ success: false, message: "Email already subscribed" });
    }

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

    const verifyLink = `${process.env.FRONTEND_URL}/verify?token=${token}`;

    await sendEmail({ email, link: verifyLink });

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
    const { page, limit, skip } = buildPagination(req.query);
    const { search, status } = req.query;
    const filter = {};

    if (status === "verified") filter.isVerified = true;
    if (status === "unverified") filter.isVerified = false;
    if (search) {
      filter.email = { $regex: String(search).trim(), $options: "i" };
    }

    const [users, total, totalSubscribers, verifiedSubscribers] =
      await Promise.all([
        HorseShippingNewsletter.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        HorseShippingNewsletter.countDocuments(filter),
        HorseShippingNewsletter.countDocuments(),
        HorseShippingNewsletter.countDocuments({ isVerified: true }),
      ]);

    return sendPaginated(res, {
      data: users,
      total,
      page,
      limit,
      meta: {
        summary: {
          totalSubscribers,
          verifiedSubscribers,
          unverifiedSubscribers: Math.max(
            totalSubscribers - verifiedSubscribers,
            0
          ),
        },
      },
    });
  } catch (error) {
    console.error("[ERROR] Fetch Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================= Delete Subscriber =================
// ================= Delete Subscriber =================
exports.deleteSubscriber = async (req, res) => {
  try {
    const { id } = req.params;
    const { ids } = req.body || {}; // Safe destructure

    // If multiple IDs provided in body
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const result = await HorseShippingNewsletter.deleteMany({
        _id: { $in: ids },
      });

      if (result.deletedCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "No subscribers found to delete" });
      }

      return res.status(200).json({
        success: true,
        message: `${result.deletedCount} subscriber(s) deleted successfully`,
      });
    }

    // If single ID provided in params
    if (id) {
      const user = await HorseShippingNewsletter.findByIdAndDelete(id);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "Subscriber not found" });
      }

      return res
        .status(200)
        .json({ success: true, message: "Subscriber deleted successfully" });
    }

    // If neither ID nor ids array provided
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
    const { subject, message, htmlContent, recipients } = req.body;

    // --- Validation ---
    if (!subject || subject.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Subject is required" });
    }

    if (!message && !htmlContent) {
      return res.status(400).json({
        success: false,
        message: "Message or HTML content is required",
      });
    }

    let targetRecipients = Array.isArray(recipients)
      ? recipients.filter(Boolean)
      : [];

    if (targetRecipients.length === 0) {
      const verifiedSubscribers = await HorseShippingNewsletter.find({
        isVerified: true,
      })
        .select("email")
        .lean();
      targetRecipients = verifiedSubscribers.map((subscriber) => subscriber.email);
    }

    if (targetRecipients.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No recipients provided" });
    }
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
    // --- Send emails in parallel ---
    const results = await Promise.allSettled(
      targetRecipients.map((email) =>
        transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: email,
          subject: subject.trim(),
          text: message || "",
          html:
            htmlContent ||
            baseTemplate({
              title: subject.trim(),
              preheader: message,
              body: `<p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
            }),
        })
      )
    );

    // --- Count successes and failures ---
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

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
