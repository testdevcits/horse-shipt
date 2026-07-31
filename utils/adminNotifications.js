const HorseAdmin = require("../models/admin/Admin");
const AdminSettings = require("../models/admin/AdminSettings");
const UserNotification = require("../models/common/UserNotification");
const transporter = require("./transporter");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");
const { ADMIN_ROOM } = require("../sockets/realtimeSocket");

let notificationIo = null;

const setAdminNotificationIo = (io) => {
  notificationIo = io;
};

const getAdminNotificationSettings = async () => {
  let settings = await AdminSettings.findOne();
  if (!settings) {
    settings = await AdminSettings.create({});
  }

  return {
    inApp: settings.notifications?.inApp !== false && settings.notificationEnabled !== false,
    email: settings.notifications?.email !== false,
    emailRecipient: settings.notifications?.emailRecipient || "",
  };
};

const formatRole = (role = "") =>
  String(role || "user")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDateTime = (value = new Date()) =>
  new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const getAdminEmailRecipients = (settings, admins) => {
  if (settings.emailRecipient) return [settings.emailRecipient];
  return admins.map((admin) => admin.email).filter(Boolean);
};

const buildNewUserAdminEmailTemplate = ({ user, role }) => {
  const year = new Date().getFullYear();
  const roleLabel = formatRole(role || user?.role);
  const name = escapeHtml(user?.name || "N/A");
  const email = escapeHtml(user?.email || "N/A");
  const uniqueId = escapeHtml(user?.uniqueId || "N/A");
  const provider = escapeHtml(formatRole(user?.provider || "local"));
  const createdAt = escapeHtml(formatDateTime(user?.createdAt || new Date()));

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>New ${roleLabel} Account Created</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;800&display=swap');
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family:'Montserrat', 'Segoe UI', Arial, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
    A new ${roleLabel} account was created successfully on HorseShipt.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; max-width:560px; background-color:#ffffff; border:1px solid #eadfca;">
          <tr>
            <td align="center" style="background-color:#BF9B53; padding:28px 24px;">
              <p style="margin:0; color:#ffffff; font-family:'Montserrat', 'Segoe UI', Arial, sans-serif; font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; opacity:0.85;">HorseShipt</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-family:'Montserrat', 'Segoe UI', Arial, sans-serif; font-size:20px; line-height:1.35; font-weight:800;">New ${roleLabel} Account Created</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px; text-align:center; color:#1f2937;">
              <p style="margin:0 0 10px; font-family:'Montserrat', 'Segoe UI', Arial, sans-serif; font-size:15px; line-height:1.5;">A new ${roleLabel.toLowerCase()} has successfully created an account on HorseShipt.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0; background-color:#fff8ea; border:1px dashed #BF9B53;">
                <tr><td style="padding:14px 16px; font-size:13px; color:#6b7280; text-align:left;">Name</td><td style="padding:14px 16px; font-size:13px; color:#1f2937; font-weight:700; text-align:right;">${name}</td></tr>
                <tr><td style="padding:14px 16px; font-size:13px; color:#6b7280; text-align:left; border-top:1px solid #eadfca;">Email</td><td style="padding:14px 16px; font-size:13px; color:#1f2937; font-weight:700; text-align:right; border-top:1px solid #eadfca;">${email}</td></tr>
                <tr><td style="padding:14px 16px; font-size:13px; color:#6b7280; text-align:left; border-top:1px solid #eadfca;">User ID</td><td style="padding:14px 16px; font-size:13px; color:#1f2937; font-weight:700; text-align:right; border-top:1px solid #eadfca;">${uniqueId}</td></tr>
                <tr><td style="padding:14px 16px; font-size:13px; color:#6b7280; text-align:left; border-top:1px solid #eadfca;">Signup Method</td><td style="padding:14px 16px; font-size:13px; color:#1f2937; font-weight:700; text-align:right; border-top:1px solid #eadfca;">${provider}</td></tr>
                <tr><td style="padding:14px 16px; font-size:13px; color:#6b7280; text-align:left; border-top:1px solid #eadfca;">Created At</td><td style="padding:14px 16px; font-size:13px; color:#1f2937; font-weight:700; text-align:right; border-top:1px solid #eadfca;">${createdAt}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; border:1px solid #eef0f3;">
                <tr>
                  <td style="padding:14px 16px; font-family:'Montserrat', 'Segoe UI', Arial, sans-serif; font-size:12.5px; line-height:1.6; color:#6b7280;">
                    <strong style="color:#374151;">Next step:</strong> Review the new account from the HorseShipt admin panel if any approval or profile verification is required.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px; background-color:#faf7f0; border-top:1px solid #eadfca; text-align:center;">
              <p style="margin:0 0 4px; font-family:'Montserrat', 'Segoe UI', Arial, sans-serif; font-size:12px; color:#9ca3af;">&copy; ${year} HorseShipt. All rights reserved.</p>
              <p style="margin:0; font-family:'Montserrat', 'Segoe UI', Arial, sans-serif; font-size:12px; color:#9ca3af;">This is an automated message, please don't reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const sendAdminNotification = async ({
  title = "Admin Notification",
  message,
  event = "admin_notification",
  type = "notification",
  data = null,
}) => {
  if (!message) return { inApp: false, email: false };

  const settings = await getAdminNotificationSettings();
  const admins = await HorseAdmin.find({
    isActive: true,
    role: { $in: ["admin", "super-admin"] },
  })
    .select("_id email role")
    .lean();

  if (!admins.length && !settings.emailRecipient) {
    return { inApp: false, email: false };
  }

  let createdNotifications = [];

  if (settings.inApp && admins.length) {
    createdNotifications = await UserNotification.insertMany(
      admins.map((admin) => ({
        role: admin.role,
        user: admin._id,
        event,
        type,
        title,
        message,
        data,
      }))
    );

    if (notificationIo) {
      notificationIo.to(ADMIN_ROOM).emit("horse_shipt:admin_notification", {
        event,
        type,
        title,
        message,
        data,
        notifications: createdNotifications.map((item) =>
          item.toObject ? item.toObject() : item
        ),
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (settings.email) {
    const html = baseTemplate({
      title,
      preheader: message,
      body: `<p>${escapeHtml(message)}</p>`,
    });

    const recipients = getAdminEmailRecipients(settings, admins);

    await Promise.allSettled(
      recipients.map((email) =>
        transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: email,
          subject: title,
          text: message,
          html,
        })
      )
    );
  }

  return settings;
};

const sendNewUserSignupAdminNotification = async ({ user, role }) => {
  if (!user) return { inApp: false, email: false };

  const roleLabel = formatRole(role || user.role);
  const title = `New ${roleLabel} Account Created`;
  const message = `${user.name || user.email} (${user.email}) created a new ${roleLabel.toLowerCase()} account.`;
  const data = {
    userId: user._id,
    uniqueId: user.uniqueId,
    email: user.email,
    name: user.name,
    role: user.role || role,
  };

  const settings = await getAdminNotificationSettings();
  const admins = await HorseAdmin.find({
    isActive: true,
    role: { $in: ["admin", "super-admin"] },
  })
    .select("_id email role")
    .lean();

  if (settings.inApp && admins.length) {
    const createdNotifications = await UserNotification.insertMany(
      admins.map((admin) => ({
        role: admin.role,
        user: admin._id,
        event: "new_user_signup",
        type: "user",
        title,
        message,
        data,
      }))
    );

    if (notificationIo) {
      notificationIo.to(ADMIN_ROOM).emit("horse_shipt:admin_notification", {
        event: "new_user_signup",
        type: "user",
        title,
        message,
        data,
        notifications: createdNotifications.map((item) =>
          item.toObject ? item.toObject() : item
        ),
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (settings.email) {
    const recipients = getAdminEmailRecipients(settings, admins);
    if (recipients.length) {
      const html = buildNewUserAdminEmailTemplate({ user, role });
      await Promise.allSettled(
        recipients.map((email) =>
          transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: email,
            subject: title,
            text: message,
            html,
          })
        )
      );
    }
  }

  return settings;
};

module.exports = {
  getAdminNotificationSettings,
  sendAdminNotification,
  sendNewUserSignupAdminNotification,
  setAdminNotificationIo,
};
