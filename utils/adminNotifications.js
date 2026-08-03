const HorseAdmin = require("../models/admin/Admin");
const AdminSettings = require("../models/admin/AdminSettings");
const UserNotification = require("../models/common/UserNotification");
const transporter = require("./transporter");
const {
  baseTemplate,
  detailTable,
  escapeHtml,
} = require("./mailTemplates/baseTemplate");
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
  const roleLabel = formatRole(role || user?.role);
  const name = escapeHtml(user?.name || "N/A");
  const email = user?.email
    ? `<a href="mailto:${escapeHtml(user.email)}" style="color:#0057c2;text-decoration:underline;">${escapeHtml(user.email)}</a>`
    : "N/A";
  const uniqueId = escapeHtml(user?.uniqueId || "N/A");
  const provider = escapeHtml(formatRole(user?.provider || "local"));
  const createdAt = escapeHtml(formatDateTime(user?.createdAt || new Date()));

  return baseTemplate({
    title: `New ${roleLabel} Account Created`,
    preheader: `A new ${roleLabel} account was created successfully on HorseShipt.`,
    body: `
      <p style="margin:0 0 10px;">A new ${roleLabel.toLowerCase()} has successfully created an account on HorseShipt.</p>
      ${detailTable([
        { label: "Name", value: name },
        { label: "Email", value: email },
        { label: "User ID", value: uniqueId },
        { label: "Signup Method", value: provider },
        { label: "Created At", value: createdAt },
      ])}
    `,
    note:
      '<strong style="color:#374151;">Next step:</strong> Review the new account from the HorseShipt admin panel if any approval or profile verification is required.',
  });
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
