const UserNotification = require("../../models/common/UserNotification");

const getRole = (req) => req.user?.role || req.baseUrl?.split("/").pop();

exports.getMyNotifications = async (req, res) => {
  try {
    const role = getRole(req);
    const user = req.user._id;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const query = { role, user };

    const [notifications, unreadCount, total] = await Promise.all([
      UserNotification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserNotification.countDocuments({
        ...query,
        read: false,
      }),
      UserNotification.countDocuments(query),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

exports.markMyNotificationsRead = async (req, res) => {
  try {
    const role = getRole(req);
    const user = req.user._id;

    await UserNotification.updateMany(
      { role, user, read: false },
      { $set: { read: true } }
    );

    return res.json({
      success: true,
      message: "Notifications marked as read",
    });
  } catch (error) {
    console.error("Mark notifications read error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update notifications",
    });
  }
};

exports.deleteMyNotification = async (req, res) => {
  try {
    const role = getRole(req);
    const user = req.user._id;
    const { notificationId } = req.params;

    const deleted = await UserNotification.findOneAndDelete({
      _id: notificationId,
      role,
      user,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification",
    });
  }
};
