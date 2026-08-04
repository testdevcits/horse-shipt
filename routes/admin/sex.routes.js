const express = require("express");
const router = express.Router();

const { sexController } = require("../../controllers/admin/horseAttribute.controller");
const adminAuth = require("../../middleware/admin/adminAuth");

router.post("/", adminAuth, sexController.create);
router.get("/", adminAuth, sexController.list);
router.get("/all", sexController.listAll);
router.put("/:id", adminAuth, sexController.update);
router.delete("/:id", adminAuth, sexController.remove);
router.patch("/:id/status", adminAuth, sexController.updateStatus);

module.exports = router;
