const express = require("express");
const router = express.Router();

const { colorController } = require("../../controllers/admin/horseAttribute.controller");
const adminAuth = require("../../middleware/admin/adminAuth");

router.post("/", adminAuth, colorController.create);
router.get("/", adminAuth, colorController.list);
router.get("/all", colorController.listAll);
router.put("/:id", adminAuth, colorController.update);
router.delete("/:id", adminAuth, colorController.remove);
router.patch("/:id/status", adminAuth, colorController.updateStatus);

module.exports = router;
