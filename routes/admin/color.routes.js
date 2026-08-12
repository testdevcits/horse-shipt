const express = require("express");
const router = express.Router();

const { colorController } = require("../../controllers/admin/horseAttribute.controller");
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const canManageHorseAttributes = requireAdminPermission("horse_attributes:manage");

router.post("/", adminAuth, canManageHorseAttributes, colorController.create);
router.get("/", adminAuth, canManageHorseAttributes, colorController.list);
router.get("/all", colorController.listAll);
router.put("/:id", adminAuth, canManageHorseAttributes, colorController.update);
router.delete("/:id", adminAuth, canManageHorseAttributes, colorController.remove);
router.patch("/:id/status", adminAuth, canManageHorseAttributes, colorController.updateStatus);

module.exports = router;
