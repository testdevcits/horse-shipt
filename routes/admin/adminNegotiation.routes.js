const express = require("express");
const adminAuth = require("../../middleware/admin/adminAuth");
const controller = require("../../controllers/admin/admin.negotiationController");

const router = express.Router();

router.get("/", adminAuth, controller.getNegotiations);

module.exports = router;
