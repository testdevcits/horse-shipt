const Customer = require("../../models/customer/customerModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const ShipmentQuestion = require("../../models/common/ShipmentQuestion");
const cloudinary = require("../../utils/cloudinary");
const sendEmail = require("../../utils/sendShipmentInviteEmail");
const webpush = require("web-push");
const mongoose = require("mongoose");
const crypto = require("crypto");
const sharp = require("sharp");

// ---------------- Helper: Upload to Cloudinary ----------------
const uploadToCloudinary = async (file, type = "photo") => {
  if (!file) return null;
  try {
    const resourceType =
      file.mimetype === "application/pdf" || type === "document"
        ? "raw"
        : "image";
    const folder = type === "photo" ? "horses/photos" : "horses/documents";

    console.log(
      `[UPLOAD] ${file.originalname} => folder: ${folder}, type: ${resourceType}`
    );

    let result;
    if (file.buffer) {
      const dataUri = `data:${file.mimetype};base64,${file.buffer.toString(
        "base64"
      )}`;
      result = await cloudinary.uploader.upload(dataUri, {
        folder,
        resource_type: resourceType,
      });
    } else if (file.path) {
      result = await cloudinary.uploader.upload(file.path, {
        folder,
        resource_type: resourceType,
      });
    }

    console.log(
      `[UPLOAD SUCCESS] ${file.originalname} => ${result.secure_url}`
    );
    return { url: result.secure_url, public_id: result.public_id };
  } catch (err) {
    console.error("[UPLOAD ERROR]", err);
    return { url: null, public_id: null };
  }
};

// ---------------- Helper: Delete from Cloudinary ----------------
const deleteFromCloudinary = async (public_id) => {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id, { resource_type: "auto" });
  } catch (err) {
    console.error("[DELETE ERROR]", err);
  }
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const isImage = (file) => {
  return file.mimetype && file.mimetype.startsWith("image/");
};

const getFileSizeBytes = (file) => {
  if (file.buffer) return file.buffer.length;
  if (file.size) return file.size;
  return 0;
};

// Image processing (client requirement applied)
const processImage = async (file) => {
  try {
    if (!file.buffer) return file.buffer;

    return await sharp(file.buffer)
      .resize({
        width: 1024,
        height: 768,
        fit: "inside", // maintain aspect ratio
        withoutEnlargement: true, // don't upscale small images
      })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch (err) {
    console.error("Image processing error:", err);
    return file.buffer;
  }
};

const getUserName = (user) =>
  user?.name || user?.fullName || user?.email || "Customer";

const buildNoteEntry = (note, user) => ({
  note: note.trim(),
  user: user?._id,
  userRole: user?.role || "customer",
  userName: getUserName(user),
  createdAt: new Date(),
});

const appendNoteIfNew = (existingLog = [], nextNote, user) => {
  const note = typeof nextNote === "string" ? nextNote.trim() : "";
  if (!note) return existingLog || [];

  const log = Array.isArray(existingLog) ? existingLog : [];
  const lastNote = log.length ? String(log[log.length - 1]?.note || "").trim() : "";
  if (lastNote === note) return log;

  return [...log, buildNoteEntry(note, user)];
};

const attachQuestionSummary = async (shipments) => {
  const plainShipments = shipments.map((shipment) =>
    typeof shipment.toObject === "function" ? shipment.toObject() : shipment
  );
  const shipmentIds = plainShipments.map((shipment) => shipment._id);

  if (!shipmentIds.length) return plainShipments;

  const questionCounts = await ShipmentQuestion.aggregate([
    { $match: { shipmentId: { $in: shipmentIds } } },
    {
      $group: {
        _id: "$shipmentId",
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        answered: {
          $sum: { $cond: [{ $eq: ["$status", "answered"] }, 1, 0] },
        },
      },
    },
  ]);

  const summaryByShipment = questionCounts.reduce((acc, item) => {
    acc[item._id.toString()] = {
      total: item.total || 0,
      pending: item.pending || 0,
      answered: item.answered || 0,
    };
    return acc;
  }, {});

  return plainShipments.map((shipment) => ({
    ...shipment,
    questionSummary: summaryByShipment[shipment._id.toString()] || {
      total: 0,
      pending: 0,
      answered: 0,
    },
  }));
};

// ---------------- Helper: Fetch Shipment By ID ----------------
exports.fetchShipmentById = async (shipmentId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) return null;

  const shipment = await CustomerShipment.findById(shipmentId);
  if (!shipment) {
    return null;
  }

  if (shipment.customer.toString() !== userId.toString()) {
    return null;
  }
  return shipment;
};

// ============================================================
// ===================== CREATE SHIPMENT ======================
// ============================================================
exports.createShipment = async (req, res) => {
  try {
    const customerId = req.user._id;
    const numberOfHorses = parseInt(req.body.numberOfHorses || "0", 10);

    if (isNaN(numberOfHorses) || numberOfHorses < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid numberOfHorses" });
    }

    // ===== FILE MAP =====
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    // ===== HORSE DATA =====
    let horseData = req.body.horses
      ? Array.isArray(req.body.horses)
        ? req.body.horses
        : JSON.parse(req.body.horses)
      : [];

    const horses = [];

    for (let i = 0; i < horseData.length; i++) {
      const h = horseData[i];
      const horseNote = typeof h.notes === "string" ? h.notes.trim() : "";

      const horseObj = {
        registeredName: h.registeredName || "",
        barnName: h.barnName || "",
        breed: h.breed || "",
        colour: h.colour || "",
        age: h.age || null,
        sex: h.sex || "",
        generalInfo: h.generalInfo || "",
        notes: horseNote,
        notesLog: horseNote ? [buildNoteEntry(horseNote, req.user)] : [],
        requestedStallSize: h.stallType || "Box",
        documents: {},
      };

      // ===== FILE HANDLER =====
      const handleFile = async (field, type) => {
        const key = `horses[${i}][${field}]`;
        if (!fileMap[key]) return null;

        const file = fileMap[key];

        if (getFileSizeBytes(file) > MAX_FILE_SIZE) {
          throw new Error(`${field} too large (Max 5MB)`);
        }

        if (!file.buffer && file.path) {
          const fs = require("fs");
          file.buffer = fs.readFileSync(file.path);
        }

        if (file.buffer && isImage(file)) {
          file.buffer = await processImage(file);
        }

        return await uploadToCloudinary(file, type);
      };

      // ===== FILES =====
      horseObj.photo = await handleFile("photo", "photo");
      horseObj.documents.coggins = await handleFile("cogins", "document");
      horseObj.documents.healthCertificate = await handleFile(
        "healthCertificate",
        "document"
      );
      horseObj.documents.other = await handleFile("otherDocuments", "document");

      horses.push(horseObj);
    }

    // ===== EMAIL =====
    const normalizedEmail = req.body.recipientEmail
      ? req.body.recipientEmail.toLowerCase().trim()
      : null;

    let recipientUser = null;
    if (normalizedEmail) {
      recipientUser = await Customer.findOne({
        email: normalizedEmail,
      });
    }

    // ===== DATE RANGE VALIDATION =====
    if (!req.body.pickupStartDate || !req.body.pickupEndDate) {
      return res.status(400).json({
        success: false,
        message: "Pickup date range required",
      });
    }

    if (!req.body.deliveryStartDate || !req.body.deliveryEndDate) {
      return res.status(400).json({
        success: false,
        message: "Delivery date range required",
      });
    }

    // ===== CREATE SHIPMENT =====
    const shipmentNote =
      typeof req.body.additionalInfo === "string"
        ? req.body.additionalInfo.trim()
        : "";

    const shipment = new CustomerShipment({
      customer: customerId,

      pickupLocation: req.body.pickupLocation,
      pickupCoords: {
        latitude: parseFloat(req.body.pickupLat),
        longitude: parseFloat(req.body.pickupLng),
      },
      pickupTimeOption: req.body.pickupTimeOption,

      // DATE RANGE
      pickupDateRange: {
        start: new Date(req.body.pickupStartDate),
        end: new Date(req.body.pickupEndDate),
      },

      deliveryLocation: req.body.deliveryLocation,
      deliveryCoords: {
        latitude: parseFloat(req.body.deliveryLat),
        longitude: parseFloat(req.body.deliveryLng),
      },
      deliveryTimeOption: req.body.deliveryTimeOption,

      // DATE RANGE
      deliveryDateRange: {
        start: new Date(req.body.deliveryStartDate),
        end: new Date(req.body.deliveryEndDate),
      },

      numberOfHorses,
      additionalInfo: shipmentNote,
      additionalInfoLog: shipmentNote
        ? [buildNoteEntry(shipmentNote, req.user)]
        : [],
      horses,

      publish: req.body.publish === "true" || req.body.publish === true,
      status: "pending",

      recipientEmail: normalizedEmail,
      recipientUser: recipientUser ? recipientUser._id : null,

      currentLocation: {
        latitude: parseFloat(req.body.pickupLat),
        longitude: parseFloat(req.body.pickupLng),
      },
    });

    await shipment.save();

    // ===== GENERATE CODE =====
    if (!shipment.shipmentCode) {
      const year = new Date().getFullYear();
      const shortId = shipment._id.toString().slice(-6).toUpperCase();
      shipment.shipmentCode = `HS-SHIP-${year}-${shortId}`;
      await shipment.save();
    }

    return res.status(201).json({
      success: true,
      shipment,
    });
  } catch (err) {
    console.error("[CREATE SHIPMENT ERROR]", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// ================= GET SHIPMENTS BY CUSTOMER =================
// ============================================================
exports.getUpcomingShipmentsByCustomer = async (req, res) => {
  try {
    // console.log(`[GET SHIPMENTS] User ID: ${req.user._id}`);
    const shipments = await CustomerShipment.find({
      customer: req.user._id,
    }).sort({ createdAt: -1 });
    const shipmentsWithQuestions = await attachQuestionSummary(shipments);
    res.status(200).json({ success: true, shipments: shipmentsWithQuestions });
  } catch (err) {
    console.error("[GET SHIPMENTS ERROR]", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ==================== GET SHIPMENT BY ID =====================
// ============================================================
exports.getShipmentById = async (req, res) => {
  try {
    // console.log(`[GET SHIPMENT BY ID] Shipment ID: ${req.params.shipmentId}`);
    const shipment = await exports.fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );
    if (!shipment) {
      // console.warn("[GET SHIPMENT BY ID] Shipment not found");
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }
    res.status(200).json({ success: true, shipment });
  } catch (err) {
    console.error("[GET SHIPMENT BY ID ERROR]", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getCompletedShipmentsByCustomer = async (req, res) => {
  try {
    const shipments = await CustomerShipment.find({
      customer: req.user._id,
      status: {
        $in: [
          "pending",
          "assigned",
          "picked",
          "in_transit",
          "delivered",
          "cancelled",
          "open_for_offers",
        ],
      },
    })
      .sort({ createdAt: -1 })
      .populate("shipper", "name email phone")
      .lean();

    // ================= GET QUOTES =================
    const shipmentIds = shipments.map((s) => s._id);

    const quotes = await ShipmentQuote.find({
      shipment: { $in: shipmentIds },
      status: "accepted", // only accepted quote
    }).select("_id shipment");

    // Map shipmentId -> quoteId
    const quoteMap = {};
    quotes.forEach((q) => {
      quoteMap[q.shipment.toString()] = q._id;
    });

    // ================= FINAL RESPONSE =================
    const shipmentsWithQuestions = await attachQuestionSummary(shipments);

    const finalShipments = shipmentsWithQuestions.map((s) => {
      return {
        ...s,

        // IMPORTANT (ADD THIS)
        quoteId: quoteMap[s._id.toString()] || null,

        // FLAGS
        isCompleted: s.status === "delivered",
        isPending: s.status === "pending",
        isInProgress: ["assigned", "picked", "in_transit"].includes(s.status),

        // OPTIONAL
        totalPrice: s.totalPrice || null,
        paymentStatus: s.paymentStatus || "pending",
        payoutStatus: s.payoutStatus || "pending",
        transportType: s.transportType || null,
        pickupTime: s.pickupTime || null,
        estimatedArrivalTime: s.estimatedArrivalTime || null,

        shipperSignature: s.shipperSignature || null,
        customerSignature: s.customerSignature || null,
      };
    });

    res.status(200).json({
      success: true,
      count: finalShipments.length,
      shipments: finalShipments,
    });
  } catch (err) {
    console.error("[GET SHIPMENTS ERROR]", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.updateShipmentByCustomer = async (req, res) => {
  try {

    const shipmentId = req.params.shipmentId;
    const customerId = req.user?._id;

    if (!shipmentId || !customerId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: customerId,
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ===== DEFINE STATES =====
    const isLocked = ["assigned", "picked", "in_transit", "delivered"].includes(
      shipment.status
    );

    // ===== FILE MAP =====
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    // =========================================================
    // CASE 1: LOCKED
    // =========================================================
    if (isLocked) {

      if (req.body?.additionalInfo) {
        const nextAdditionalInfo = req.body.additionalInfo.trim();
        shipment.additionalInfo = nextAdditionalInfo;
        shipment.additionalInfoLog = appendNoteIfNew(
          shipment.additionalInfoLog,
          nextAdditionalInfo,
          req.user
        );
      }

      let lockedHorseData = [];
      try {
        lockedHorseData = req.body.horses
          ? Array.isArray(req.body.horses)
            ? req.body.horses
            : JSON.parse(req.body.horses)
          : [];
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid horses data",
        });
      }

      const updatedHorses = [];

      for (let i = 0; i < shipment.horses.length; i++) {
        const existingHorse = shipment.horses[i];
        const incomingHorse = lockedHorseData[i] || {};

        const horseObj = {
          ...existingHorse.toObject(),
          documents: { ...existingHorse.documents },
        };

        if (incomingHorse.generalInfo !== undefined) {
          horseObj.generalInfo = incomingHorse.generalInfo || "";
        }

        if (incomingHorse.notes !== undefined) {
          const nextNote = incomingHorse.notes.trim();
          horseObj.notes = nextNote;
          horseObj.notesLog = appendNoteIfNew(
            horseObj.notesLog,
            nextNote,
            req.user
          );
        }

        const handleFile = async (field, type) => {
          const key = `horses[${i}][${field}]`;
          if (!fileMap[key]) return null;

          const file = fileMap[key];

          if (getFileSizeBytes(file) > MAX_FILE_SIZE) {
            throw new Error(`${field} too large`);
          }

          if (!file.buffer && file.path) {
            const fs = require("fs");
            file.buffer = fs.readFileSync(file.path);
          }

          if (file.buffer && isImage(file)) {
            file.buffer = await processImage(file);
          }

          return await uploadToCloudinary(file, type);
        };

        const newCoggins = await handleFile("cogins", "document");
        const newHealth = await handleFile("healthCertificate", "document");
        const newOther = await handleFile("otherDocuments", "document");

        if (newCoggins) horseObj.documents.coggins = newCoggins;
        if (newHealth) horseObj.documents.healthCertificate = newHealth;
        if (newOther) horseObj.documents.other = newOther;

        updatedHorses.push(horseObj);
      }

      shipment.horses = updatedHorses;

      await shipment.save();

      return res.status(200).json({
        success: true,
        message: "Only documents and notes updated (shipment locked)",
        shipment,
      });
    }

    // =========================================================
    // CASE 2: NOT LOCKED
    // =========================================================

    // ===== SAFE BODY =====
    const body = req.body || {};

    // ===== BASIC FIELDS (SAFE FIX) =====
    if (body.pickupLocation !== undefined) {
      shipment.pickupLocation = body.pickupLocation;
    }

    if (body.deliveryLocation !== undefined) {
      shipment.deliveryLocation = body.deliveryLocation;
    }

    if (body.additionalInfo !== undefined) {
      const nextAdditionalInfo = body.additionalInfo.trim();
      shipment.additionalInfo = nextAdditionalInfo;
      shipment.additionalInfoLog = appendNoteIfNew(
        shipment.additionalInfoLog,
        nextAdditionalInfo,
        req.user
      );
    }

    if (body.publish !== undefined) {
      shipment.publish = body.publish === "true" || body.publish === true;
    }

    // ===== DATE RANGE =====
    if (body.pickupStartDate && body.pickupEndDate) {
      shipment.pickupDateRange = {
        start: new Date(body.pickupStartDate),
        end: new Date(body.pickupEndDate),
      };
    }

    if (body.deliveryStartDate && body.deliveryEndDate) {
      shipment.deliveryDateRange = {
        start: new Date(body.deliveryStartDate),
        end: new Date(body.deliveryEndDate),
      };
    }

    // ===== HORSE DATA =====
    let horseData = [];

    try {
      horseData = body.horses
        ? Array.isArray(body.horses)
          ? body.horses
          : JSON.parse(body.horses)
        : [];
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid horses data",
      });
    }

    const updatedHorses = [];

    for (let i = 0; i < horseData.length; i++) {
      const h = horseData[i];
      const existingHorse = shipment.horses[i] || {};
      const hasIncomingNote = h.notes !== undefined;
      const horseNote = hasIncomingNote
        ? String(h.notes || "").trim()
        : existingHorse.notes || "";

      const horseObj = {
        registeredName: h.registeredName || "",
        barnName: h.barnName || "",
        breed: h.breed || "",
        colour: h.colour || "",
        age: h.age || null,
        sex: h.sex || "",
        generalInfo: h.generalInfo || "",
        notes: horseNote,
        notesLog: hasIncomingNote
          ? appendNoteIfNew(existingHorse.notesLog, horseNote, req.user)
          : existingHorse.notesLog || [],
        requestedStallSize: h.stallType || "Box",
        documents: {},
      };

      const handleFile = async (field, type) => {
        const key = `horses[${i}][${field}]`;
        if (!fileMap[key]) return null;

        const file = fileMap[key];

        if (getFileSizeBytes(file) > MAX_FILE_SIZE) {
          throw new Error(`${field} too large`);
        }

        if (!file.buffer && file.path) {
          const fs = require("fs");
          file.buffer = fs.readFileSync(file.path);
        }

        if (file.buffer && isImage(file)) {
          file.buffer = await processImage(file);
        }

        return await uploadToCloudinary(file, type);
      };

      horseObj.photo =
        (await handleFile("photo", "photo")) || existingHorse.photo;

      horseObj.documents.coggins =
        (await handleFile("cogins", "document")) ||
        existingHorse?.documents?.coggins;

      horseObj.documents.healthCertificate =
        (await handleFile("healthCertificate", "document")) ||
        existingHorse?.documents?.healthCertificate;

      horseObj.documents.other =
        (await handleFile("otherDocuments", "document")) ||
        existingHorse?.documents?.other;

      updatedHorses.push(horseObj);
    }

    if (updatedHorses.length > 0) {
      shipment.horses = updatedHorses;
      shipment.numberOfHorses = updatedHorses.length;
    }

    // ===== SAVE =====
    await shipment.save();

    return res.status(200).json({
      success: true,
      message: "Shipment updated successfully",
      shipment,
    });
  } catch (err) {
    console.error("[UPDATE SHIPMENT ERROR FULL]", err);
    console.error("STACK:", err.stack);

    return res.status(500).json({
      success: false,
      message: err.message || "Server Error",
    });
  }
};

// ============================================================
// =========== UPDATE PUBLISHED METADATA ONLY ==================
// ============================================================
exports.updateShipmentMetadataByCustomer = async (req, res) => {
  try {
    const shipmentId = req.params.shipmentId;
    const customerId = req.user?._id;

    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: customerId,
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const editableStatuses = [
      "pending",
      "open_for_offers",
      "assigned",
      "picked",
      "in_transit",
    ];

    if (!shipment.publish && shipment.status === "pending") {
      return res.status(400).json({
        success: false,
        message: "Use full shipment edit before publishing",
      });
    }

    if (!editableStatuses.includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message: "Documents and notes can no longer be edited",
      });
    }

    const forbiddenFields = [
      "pickupLocation",
      "pickupLat",
      "pickupLng",
      "pickupStartDate",
      "pickupEndDate",
      "deliveryLocation",
      "deliveryLat",
      "deliveryLng",
      "deliveryStartDate",
      "deliveryEndDate",
      "numberOfHorses",
      "publish",
      "status",
      "shipper",
    ];

    const blockedField = forbiddenFields.find((field) => field in req.body);
    if (blockedField) {
      return res.status(400).json({
        success: false,
        message: `Field '${blockedField}' cannot be updated from metadata endpoint`,
      });
    }

    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    let horseData = [];
    try {
      horseData = req.body.horses
        ? Array.isArray(req.body.horses)
          ? req.body.horses
          : JSON.parse(req.body.horses)
        : [];
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid horses data",
      });
    }

    if (req.body.additionalInfo !== undefined) {
      const nextAdditionalInfo = String(req.body.additionalInfo || "").trim();
      shipment.additionalInfo = nextAdditionalInfo;
      shipment.additionalInfoLog = appendNoteIfNew(
        shipment.additionalInfoLog,
        nextAdditionalInfo,
        req.user
      );
    }

    const updatedHorses = [];

    for (let i = 0; i < shipment.horses.length; i++) {
      const existingHorse = shipment.horses[i];
      const incomingHorse = horseData[i] || {};
      const horseObj = {
        ...existingHorse.toObject(),
        documents: { ...existingHorse.documents },
      };

      if (incomingHorse.generalInfo !== undefined) {
        horseObj.generalInfo = String(incomingHorse.generalInfo || "");
      }

      if (incomingHorse.notes !== undefined) {
        const nextNote = String(incomingHorse.notes || "").trim();
        horseObj.notes = nextNote;
        horseObj.notesLog = appendNoteIfNew(
          horseObj.notesLog,
          nextNote,
          req.user
        );
      }

      const handleFile = async (field, type) => {
        const key = `horses[${i}][${field}]`;
        if (!fileMap[key]) return null;

        const file = fileMap[key];
        if (getFileSizeBytes(file) > MAX_FILE_SIZE) {
          throw new Error(`${field} too large (Max 5MB)`);
        }

        if (!file.buffer && file.path) {
          const fs = require("fs");
          file.buffer = fs.readFileSync(file.path);
        }

        if (file.buffer && isImage(file)) {
          file.buffer = await processImage(file);
        }

        return await uploadToCloudinary(file, type);
      };

      const newCoggins = await handleFile("cogins", "document");
      const newHealth = await handleFile("healthCertificate", "document");
      const newOther = await handleFile("otherDocuments", "document");

      if (newCoggins) horseObj.documents.coggins = newCoggins;
      if (newHealth) horseObj.documents.healthCertificate = newHealth;
      if (newOther) horseObj.documents.other = newOther;

      updatedHorses.push(horseObj);
    }

    shipment.horses = updatedHorses;
    await shipment.save();

    return res.status(200).json({
      success: true,
      message: "Documents and notes updated successfully",
      shipment,
    });
  } catch (err) {
    console.error("[UPDATE SHIPMENT METADATA ERROR]", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server Error",
    });
  }
};
// GET /api/shipments/:id

exports.getSingleShipmentForMap = async (req, res) => {
  try {
    const shipment = await CustomerShipment.findById(req.params.id)
      .select("_id shipmentCode pickupCoords deliveryCoords status")
      .lean();

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    return res.status(200).json({
      success: true,
      shipment: {
        id: shipment._id,
        code: shipment.shipmentCode,
        status: shipment.status,
        pickup: shipment.pickupCoords,
        delivery: shipment.deliveryCoords,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// ===================== PUBLISH SHIPMENT =====================
// ============================================================
const logoUrl = `${process.env.BACKEND_URL}/assets/logo.png`;
const FRONTEND_URL = process.env.FRONTEND_URL;

const ENCRYPTION_KEY =
  process.env.EMAIL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

const encryptEmail = (email) => {
  try {

    if (!email || typeof email !== "string") {
      throw new Error("Invalid email for encryption");
    }

    if (!ENCRYPTION_KEY) {
      throw new Error("ENCRYPTION_KEY is missing in env");
    }

    if (ENCRYPTION_KEY.length !== 64) {
      throw new Error(
        "ENCRYPTION_KEY must be 64 hex characters (32 bytes for AES-256)"
      );
    }

    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv
    );

    let encrypted = cipher.update(email, "utf8", "hex");
    encrypted += cipher.final("hex");

    const finalData = iv.toString("hex") + ":" + encrypted;

    return finalData;
  } catch (err) {
    console.error("Encryption error:", err.message);
    throw err;
  }
};
// ---------------- EMAIL FUNCTION ----------------
const formatShipmentEmailDate = (dateValue) => {
  if (!dateValue) return "N/A";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatShipmentEmailDateRange = (range, fallbackDate) => {
  const start = range?.start || fallbackDate;
  const end = range?.end || fallbackDate;

  if (!start && !end) return "N/A";

  const startText = formatShipmentEmailDate(start);
  const endText = formatShipmentEmailDate(end);

  if (startText === "N/A") return endText;
  if (endText === "N/A" || startText === endText) return startText;
  return `${startText} - ${endText}`;
};

const sendRecipientInviteEmail = async ({
  email,
  shipment,
  customerName,
  link, // receive link from publishShipment
}) => {
  try {

    if (!email || typeof email !== "string") {
      throw new Error("Invalid email");
    }

    if (!link) {
      throw new Error("Invite link is missing");
    }

    const html = `
    <div style="font-family: Arial, sans-serif; padding:20px;">
      <div style="max-width:600px; margin:auto; background:#fff; border-radius:10px; overflow:hidden;">
        <div style="background:#BF9B53; color:#fff; padding:20px; text-align:center;">
          <h2>Shipment Invitation</h2>
        </div>
        <div style="padding:20px;">
          <p><strong>${customerName}</strong> has invited you to track a shipment.</p>

          <h3>Shipment Details</h3>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td><strong>Shipment Code</strong></td><td>${
              shipment.shipmentCode || "N/A"
            }</td></tr>
            <tr><td><strong>Pickup</strong></td><td>${
              shipment.pickupLocation || "N/A"
            }</td></tr>
            <tr><td><strong>Delivery</strong></td><td>${
              shipment.deliveryLocation || "N/A"
            }</td></tr>
            <tr><td><strong>Pickup Date</strong></td><td>${
              formatShipmentEmailDateRange(
                shipment.pickupDateRange,
                shipment.pickupDate
              )
            }</td></tr>
            <tr><td><strong>Delivery Date</strong></td><td>${
              formatShipmentEmailDateRange(
                shipment.deliveryDateRange,
                shipment.deliveryDate
              )
            }</td></tr>
          </table>

          <div style="text-align:center; margin:25px 0;">
            <a href="${link}" 
              style="background:#BF9B53; color:#fff; padding:12px 25px; text-decoration:none; border-radius:5px;">
              View Shipment
            </a>
          </div>

          <p style="font-size:12px; color:#777;">
            Link expires in 24 hours. To track more shipments, please sign up.
            <br/>
            <a href="${process.env.FRONTEND_URL}/signup">Sign Up</a>
          </p>
        </div>

        <div style="background:#f1f1f1; text-align:center; padding:10px; font-size:12px;">
          © ${new Date().getFullYear()} Horsehipt
        </div>
      </div>
    </div>
    `;

    await sendEmail({
      to: email,
      subject: `Shipment Invite from ${customerName}`,
      html,
    });
  } catch (err) {
    console.error("Email send error:", err.message);
  }
};

// ---------------- PUBLISH SHIPMENT ----------------
exports.publishShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res.status(400).json({ message: "Invalid shipment ID" });
    }

    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: req.user._id,
    });

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }

    if (shipment.publish) {
      return res.status(400).json({ message: "Shipment already published" });
    }

    // ---------------- PUBLISH SHIPMENT ----------------
    shipment.publish = true;
    shipment.status = "open_for_offers";
    shipment.publishedAt = new Date();

    // ---------------- RECIPIENT LOGIC ----------------

    if (
      shipment.recipientEmail &&
      typeof shipment.recipientEmail === "string"
    ) {
      const normalizedEmail = shipment.recipientEmail.toLowerCase().trim();

      if (!normalizedEmail) {
        throw new Error("Invalid recipient email");
      }

      // generate unique invite token
      const token = crypto.randomBytes(20).toString("hex");
      shipment.inviteToken = token;
      shipment.inviteTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // link recipient to existing user if present
      const existingUser = await Customer.findOne({
        email: normalizedEmail,
      });

      if (existingUser) {
        shipment.recipientUser = existingUser._id;
      } else {
      }

      // send invite email once
      if (!shipment.recipientInviteSent) {
        let encryptedEmail;

        try {
          encryptedEmail = encodeURIComponent(encryptEmail(normalizedEmail));
        } catch (err) {
          console.error("Email encryption failed:", err);
          throw new Error("Email encryption failed");
        }

        const link = `${process.env.FRONTEND_URL}/invite/${token}?e=${encryptedEmail}`;

        await sendRecipientInviteEmail({
          email: normalizedEmail,
          shipment,
          customerName: req.user.name || "Customer",
          link,
        });

        shipment.recipientInviteSent = true;
      } else {
      }
    } else {
    }

    await shipment.save();

    res.json({
      success: true,
      message: "Shipment published successfully",
      shipment,
    });
  } catch (err) {
    console.error("[PUBLISH SHIPMENT ERROR]", err);
    res.status(500).json({
      message: err.message || "Server error",
    });
  }
};

// ============================================================
// ===================== DELETE SHIPMENT ======================
// ============================================================
exports.deleteShipment = async (req, res) => {
  try {
    const shipment = await exports.fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (shipment.publish) {
      console.warn("[DELETE SHIPMENT] Cannot delete published shipment");
      return res.status(400).json({
        success: false,
        message: "Published shipment cannot be deleted",
      });
    }

    // Delete horse files
    for (const h of shipment.horses) {
      if (h.photo?.public_id) await deleteFromCloudinary(h.photo.public_id);
      if (h.documents?.coggins?.public_id)
        await deleteFromCloudinary(h.documents.coggins.public_id);
      if (h.documents?.healthCertificate?.public_id)
        await deleteFromCloudinary(h.documents.healthCertificate.public_id);
      if (h.documents?.other?.public_id)
        await deleteFromCloudinary(h.documents.other.public_id);
    }

    await shipment.deleteOne();

    res
      .status(200)
      .json({ success: true, message: "Shipment deleted successfully" });
  } catch (err) {
    console.error("[DELETE SHIPMENT ERROR]", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ===================== UPDATE LOCATION ======================
// ============================================================
exports.updateShipmentLocation = async (req, res) => {
  try {
    console.log(
      `[UPDATE LOCATION] Shipment ID: ${req.params.shipmentId}, Location:`,
      req.body
    );
    const shipment = await exports.fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    const { latitude, longitude } = req.body;
    const newLocation = { latitude, longitude, updatedAt: new Date() };

    shipment.currentLocation = newLocation;
    shipment.locationHistory.push(newLocation);
    await shipment.save();
    res
      .status(200)
      .json({ success: true, currentLocation: shipment.currentLocation });
  } catch (err) {
    console.error("[UPDATE LOCATION ERROR]", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ===================== NOTIFY ACCEPTED ======================
// ============================================================
exports.notifyShipmentAccepted = async (shipmentId, shipperName) => {
  try {
    console.log(
      `[NOTIFY ACCEPTED] Shipment ID: ${shipmentId}, Shipper: ${shipperName}`
    );
    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) return;

    const notif = await CustomerNotification.findOne({
      user: shipment.customer,
    });
    if (!notif?.subscription || !notif.settings.shipmentUpdates) return;

    const payload = JSON.stringify({
      title: "Shipment Accepted",
      body: `Shipment ${shipment.shipmentCode} accepted by ${shipperName}`,
      type: "shipment_update",
    });

    await webpush.sendNotification(notif.subscription, payload);
  } catch (err) {
    console.error("[NOTIFY ACCEPTED ERROR]", err);
  }
};

// ============================================================
// ===================== GET AVAILABLE SHIPMENTS ==============
// ============================================================
exports.getAvailableShipments = async (req, res) => {
  try {
    const shipments = await CustomerShipment.find({
      publish: true,
      status: "open_for_offers",
      shipper: null,
    })
      .populate("customer", "name phone")
      .sort({ publishedAt: -1 });
    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[AVAILABLE SHIPMENTS ERROR]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
