const UserNotification = require("../../models/common/UserNotification");

const getRole = (req) => req.user?.role || req.baseUrl?.split("/").pop();

exports.getMyNotifications = async (req, res) => {
  try {
    const role = getRole(req);
    const user = req.user._id;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const notifications = await UserNotification.find({ role, user })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await UserNotification.countDocuments({
      role,
      user,
      read: false,
    });

    return res.json({
      success: true,
      data: notifications,
      unreadCount,
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
