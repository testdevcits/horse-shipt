const express = require("express");
const router = express.Router();

const adminCustomerController = require("../../controllers/admin/admin.customerController");
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const canAccessCustomers = requireAdminPermission("customers:list");

router.get("/all", adminAuth, canAccessCustomers, adminCustomerController.getAllCustomers);
router.get("/:id/payments", adminAuth, canAccessCustomers, adminCustomerController.getCustomerPayments);
router.get("/:id/full-data", adminAuth, canAccessCustomers, adminCustomerController.getCustomerFullData);
router.get("/:id", adminAuth, canAccessCustomers, adminCustomerController.getCustomerById);
router.put("/:id", adminAuth, canAccessCustomers, adminCustomerController.updateCustomerById);
router.patch("/:id/status", adminAuth, canAccessCustomers, adminCustomerController.toggleCustomerStatus);
router.delete("/:id", adminAuth, canAccessCustomers, adminCustomerController.deleteCustomer);

module.exports = router;
