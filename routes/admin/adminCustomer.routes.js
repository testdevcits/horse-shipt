const express = require("express");
const router = express.Router();

const adminCustomerController = require("../../controllers/admin/admin.customerController");
const adminAuth = require("../../middleware/admin/adminAuth");

router.get("/all", adminAuth, adminCustomerController.getAllCustomers);
router.get("/:id/payments", adminAuth, adminCustomerController.getCustomerPayments);
router.get("/:id/full-data", adminAuth, adminCustomerController.getCustomerFullData);
router.get("/:id", adminAuth, adminCustomerController.getCustomerById);
router.put("/:id", adminAuth, adminCustomerController.updateCustomerById);
router.patch("/:id/status", adminAuth, adminCustomerController.toggleCustomerStatus);
router.delete("/:id", adminAuth, adminCustomerController.deleteCustomer);

module.exports = router;
