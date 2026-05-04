const express = require("express");
const router = express.Router();

const adminAuth = require("../../../middleware/admin/adminAuth");
const adminPaymentsController = require("../../../controllers/admin/Payments/adminPaymentsController");

router.get("/summary", adminAuth, adminPaymentsController.getPaymentSummary);
router.get("/transactions", adminAuth, adminPaymentsController.getAllTransactions);

module.exports = router;
