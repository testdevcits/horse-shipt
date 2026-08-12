const express = require("express");
const router = express.Router();

const { sexController } = require("../../controllers/admin/horseAttribute.controller");
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const canManageHorseAttributes = requireAdminPermission("horse_attributes:sexes");

router.post("/", adminAuth, canManageHorseAttributes, sexController.create);
router.get("/", adminAuth, canManageHorseAttributes, sexController.list);
router.get("/all", sexController.listAll);
router.put("/:id", adminAuth, canManageHorseAttributes, sexController.update);
router.delete("/:id", adminAuth, canManageHorseAttributes, sexController.remove);
router.patch("/:id/status", adminAuth, canManageHorseAttributes, sexController.updateStatus);

module.exports = router;
