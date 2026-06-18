const { apiResponse } = require("../../responses/api.response");
const UserNotification = require("../../models/common/UserNotification");

const getRole = (req) => req.user?.role || req.baseUrl?.split("/").pop();
const normalizeIds = (ids = []) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => id?.toString?.() || "")
    .filter((id) => /^[a-f\d]{24}$/i.test(id));

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
      message: apiResponse.FAILED_TO_FETCH_NOTIFICATIONS,
    });
  }
};

exports.markMyNotificationsRead = async (req, res) => {
  try {
    const role = getRole(req);
    const user = req.user._id;
    const ids = normalizeIds(req.body?.ids);
    const query = { role, user, read: false };

    if (ids.length) {
      query._id = { $in: ids };
    }

    await UserNotification.updateMany(query, { $set: { read: true } });

    return res.json({
      success: true,
      message: apiResponse.NOTIFICATIONS_MARKED_AS_READ,
    });
  } catch (error) {
    console.error("Mark notifications read error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_UPDATE_NOTIFICATIONS,
    });
  }
};

exports.deleteMyNotifications = async (req, res) => {
  try {
    const role = getRole(req);
    const user = req.user._id;
    const ids = normalizeIds(req.body?.ids);
    const deleteAll = req.body?.all === true;

    if (!deleteAll && ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: apiResponse.NOTIFICATION_NOT_FOUND,
      });
    }

    const query = deleteAll ? { role, user } : { role, user, _id: { $in: ids } };
    const result = await UserNotification.deleteMany(query);

    return res.json({
      success: true,
      message: apiResponse.NOTIFICATION_DELETED,
      data: { deletedCount: result.deletedCount || 0 },
    });
  } catch (error) {
    console.error("Delete notifications error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_DELETE_NOTIFICATION,
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
        message: apiResponse.NOTIFICATION_NOT_FOUND,
      });
    }

    return res.json({
      success: true,
      message: apiResponse.NOTIFICATION_DELETED,
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_DELETE_NOTIFICATION,
    });
  }
};
