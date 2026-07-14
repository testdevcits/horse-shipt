const AdminSettings = require("../../models/admin/AdminSettings");
const UserNotification = require("../../models/common/UserNotification");

const getAdminSettings = async () => {
  let settings = await AdminSettings.findOne();
  if (!settings) {
    settings = await AdminSettings.create({});
  }
  if (!settings.notifications) {
    settings.notifications = {};
  }
  if (settings.notifications.inApp === undefined) {
    settings.notifications.inApp = settings.notificationEnabled !== false;
  }
  if (settings.notifications.email === undefined) {
    settings.notifications.email = true;
  }
  if (settings.isModified?.()) {
    await settings.save();
  }
  return settings;
};

const formatSettings = (settings) => ({
  notificationEnabled: settings.notifications?.inApp !== false,
  notifications: {
    inApp: settings.notifications?.inApp !== false,
    email: settings.notifications?.email !== false,
  },
});

exports.getNotificationSettings = async (_req, res) => {
  try {
    const settings = await getAdminSettings();

    return res.json({
      success: true,
      data: formatSettings(settings),
    });
  } catch (error) {
    console.error("Get admin notification settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin notification settings",
    });
  }
};

exports.updateNotificationSettings = async (req, res) => {
  try {
    const notificationEnabled = req.body?.notificationEnabled;
    const notifications = req.body?.notifications || {};

    const hasLegacyValue = typeof notificationEnabled === "boolean";
    const hasInAppValue = typeof notifications.inApp === "boolean";
    const hasEmailValue = typeof notifications.email === "boolean";

    if (!hasLegacyValue && !hasInAppValue && !hasEmailValue) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one notification setting",
      });
    }

    const current = await getAdminSettings();
    const nextInApp = hasInAppValue
      ? notifications.inApp
      : hasLegacyValue
      ? notificationEnabled
      : current.notifications?.inApp !== false;
    const nextEmail = hasEmailValue
      ? notifications.email
      : current.notifications?.email !== false;

    const settings = await AdminSettings.findOneAndUpdate(
      {},
      {
        $set: {
          notificationEnabled: nextInApp,
          "notifications.inApp": nextInApp,
          "notifications.email": nextEmail,
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: "Admin notification settings updated",
      data: formatSettings(settings),
    });
  } catch (error) {
    console.error("Update admin notification settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update admin notification settings",
    });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const settings = await getAdminSettings();
    const notificationEnabled = settings.notifications?.inApp !== false;

    if (!notificationEnabled) {
      return res.json({
        success: true,
        data: [],
        summary: { total: 0, unread: 0, enabled: false },
        pagination: {
          page: 1,
          limit: Number(req.query.limit) || 10,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
        },
      });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;
    const { role = "", status = "", search = "" } = req.query;

    const query = {};
    if (["customer", "shipper", "admin", "super-admin"].includes(role)) {
      query.role = role;
    }
    if (status === "read") query.read = true;
    if (status === "unread") query.read = false;
    if (search.trim()) {
      const pattern = new RegExp(search.trim(), "i");
      query.$or = [
        { title: pattern },
        { message: pattern },
        { event: pattern },
        { type: pattern },
      ];
    }

    const [notifications, total, unread] = await Promise.all([
      UserNotification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserNotification.countDocuments(query),
      UserNotification.countDocuments({ ...query, read: false }),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.json({
      success: true,
      data: notifications,
      summary: { total, unread, enabled: true },
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    console.error("Get admin notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin notifications",
    });
  }
};
