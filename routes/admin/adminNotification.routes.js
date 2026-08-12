const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const controller = require("../../controllers/admin/adminNotification.controller");
const canAccessNotifications = requireAdminPermission("notifications:list");

router.get("/settings", adminAuth, canAccessNotifications, controller.getNotificationSettings);
router.put("/settings", adminAuth, canAccessNotifications, controller.updateNotificationSettings);
router.get("/", adminAuth, canAccessNotifications, controller.getNotifications);
router.patch("/read", adminAuth, canAccessNotifications, controller.markNotificationsRead);
router.delete("/", adminAuth, canAccessNotifications, controller.deleteNotifications);
router.delete("/:notificationId", adminAuth, canAccessNotifications, controller.deleteNotification);

module.exports = router;
