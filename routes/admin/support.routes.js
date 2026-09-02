const express = require("express");
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const {
  getAdminSupportTickets,
  adminReplySupportTicket,
  updateSupportTicketStatus,
} = require("../../controllers/common/supportTicketController");

const router = express.Router();
const canAccessSupport = requireAdminPermission("support:list");

router.get("/", adminAuth, canAccessSupport, getAdminSupportTickets);
router.post("/:ticketId/reply", adminAuth, canAccessSupport, adminReplySupportTicket);
router.patch("/:ticketId/status", adminAuth, canAccessSupport, updateSupportTicketStatus);

module.exports = router;
