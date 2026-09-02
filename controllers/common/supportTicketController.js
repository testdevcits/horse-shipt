const SupportTicket = require("../../models/common/SupportTicket");

const ROLE_MODEL = {
  customer: "Customer",
  shipper: "Shipper",
  admin: "HorseAdmin",
};

const cleanText = (value = "") => String(value).trim();

const buildPagination = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const formatTicket = (ticket) => {
  const doc = ticket.toObject ? ticket.toObject() : ticket;
  return {
    ...doc,
    latestMessage: doc.messages?.[doc.messages.length - 1] || null,
  };
};

const getRequester = (req, role) => {
  if (role === "admin") return req.admin;
  return req.user;
};

const ticketAccessFilter = (req, role) => {
  if (role === "admin") return {};
  return { requesterRole: role, requester: req.user._id };
};

exports.getMySupportTickets = (role) => async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const { status } = req.query;
    const filter = ticketAccessFilter(req, role);

    if (["open", "in_progress", "resolved"].includes(status)) {
      filter.status = status;
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: tickets.map(formatTicket),
      pagination: {
        page,
        limit,
        total,
        totalRecords: total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support tickets",
    });
  }
};

exports.createSupportTicket = (role) => async (req, res) => {
  try {
    const subject = cleanText(req.body.subject);
    const message = cleanText(req.body.message);
    const category = cleanText(req.body.category) || "General";
    const priority = ["low", "normal", "high"].includes(req.body.priority)
      ? req.body.priority
      : "normal";

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required",
      });
    }

    const requester = getRequester(req, role);
    const ticket = await SupportTicket.create({
      requesterRole: role,
      requester: requester._id,
      requesterModel: ROLE_MODEL[role],
      subject,
      category,
      priority,
      lastMessageAt: new Date(),
      messages: [
        {
          senderRole: role,
          sender: requester._id,
          senderModel: ROLE_MODEL[role],
          message,
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Support request submitted successfully",
      data: formatTicket(ticket),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to submit support request",
    });
  }
};

exports.addSupportMessage = (role) => async (req, res) => {
  try {
    const message = cleanText(req.body.message);
    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const ticket = await SupportTicket.findOne({
      _id: req.params.ticketId,
      ...ticketAccessFilter(req, role),
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }

    if (ticket.status === "resolved" && role !== "admin") {
      ticket.status = "open";
      ticket.resolvedAt = null;
      ticket.resolvedBy = null;
    }

    const sender = getRequester(req, role);
    ticket.messages.push({
      senderRole: role,
      sender: sender._id || sender.id,
      senderModel: ROLE_MODEL[role],
      message,
    });
    ticket.lastMessageAt = new Date();
    await ticket.save();

    return res.status(200).json({
      success: true,
      message: "Message sent successfully",
      data: formatTicket(ticket),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send support message",
    });
  }
};

exports.getAdminSupportTickets = async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const { role = "shipper", status, search } = req.query;
    const filter = {};

    if (["customer", "shipper"].includes(role)) filter.requesterRole = role;
    if (["open", "in_progress", "resolved"].includes(status)) filter.status = status;
    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { "messages.message": { $regex: search, $options: "i" } },
      ];
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate("requester", "name email uniqueId mobile phone")
        .populate("resolvedBy", "name email")
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: tickets.map(formatTicket),
      pagination: {
        page,
        limit,
        total,
        totalRecords: total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support tickets",
    });
  }
};

exports.adminReplySupportTicket = async (req, res) => {
  try {
    const message = cleanText(req.body.message);
    if (!message) {
      return res.status(400).json({ success: false, message: "Reply is required" });
    }

    const ticket = await SupportTicket.findById(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }

    ticket.messages.push({
      senderRole: "admin",
      sender: req.admin.id,
      senderModel: ROLE_MODEL.admin,
      message,
    });
    ticket.status = "in_progress";
    ticket.resolvedAt = null;
    ticket.resolvedBy = null;
    ticket.lastMessageAt = new Date();
    await ticket.save();

    await ticket.populate("requester", "name email uniqueId mobile phone");

    return res.status(200).json({
      success: true,
      message: "Reply sent successfully",
      data: formatTicket(ticket),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to reply to support ticket",
    });
  }
};

exports.updateSupportTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["open", "in_progress", "resolved"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid support status" });
    }

    const ticket = await SupportTicket.findById(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }

    ticket.status = status;
    ticket.resolvedAt = status === "resolved" ? new Date() : null;
    ticket.resolvedBy = status === "resolved" ? req.admin.id : null;
    await ticket.save();

    await ticket.populate("requester", "name email uniqueId mobile phone");

    return res.status(200).json({
      success: true,
      message: "Support ticket status updated",
      data: formatTicket(ticket),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update support ticket status",
    });
  }
};
