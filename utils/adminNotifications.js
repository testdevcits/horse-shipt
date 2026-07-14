const HorseAdmin = require("../models/admin/Admin");
const AdminSettings = require("../models/admin/AdminSettings");
const UserNotification = require("../models/common/UserNotification");
const transporter = require("./transporter");
const { baseTemplate, escapeHtml } = require("./mailTemplates/baseTemplate");

const getAdminNotificationSettings = async () => {
  let settings = await AdminSettings.findOne();
  if (!settings) {
    settings = await AdminSettings.create({});
  }

  return {
    inApp: settings.notifications?.inApp !== false && settings.notificationEnabled !== false,
    email: settings.notifications?.email !== false,
  };
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

  if (!admins.length) return { inApp: false, email: false };

  if (settings.inApp) {
    await UserNotification.insertMany(
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
  }

  if (settings.email) {
    const html = baseTemplate({
      title,
      preheader: message,
      body: `<p>${escapeHtml(message)}</p>`,
    });

    await Promise.allSettled(
      admins
        .filter((admin) => admin.email)
        .map((admin) =>
          transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: admin.email,
            subject: title,
            text: message,
            html,
          })
        )
    );
  }

  return settings;
};

module.exports = {
  getAdminNotificationSettings,
  sendAdminNotification,
};
