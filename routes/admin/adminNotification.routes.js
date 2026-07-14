const express = require("express");
const router = express.Router();
const adminAuth = require("../../middleware/admin/adminAuth");
const controller = require("../../controllers/admin/adminNotification.controller");

router.get("/settings", adminAuth, controller.getNotificationSettings);
router.put("/settings", adminAuth, controller.updateNotificationSettings);
router.get("/", adminAuth, controller.getNotifications);
router.delete("/", adminAuth, controller.deleteNotifications);
router.delete("/:notificationId", adminAuth, controller.deleteNotification);

module.exports = router;
