const Customer = require("../../models/customer/customerModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");
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
    console.log(`[DELETE] Cloudinary public_id: ${public_id}`);
    await cloudinary.uploader.destroy(public_id, { resource_type: "auto" });
    console.log("[DELETE SUCCESS]");
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

// ---------------- Helper: Fetch Shipment By ID ----------------
exports.fetchShipmentById = async (shipmentId, userId) => {
  console.log(`[FETCH SHIPMENT] shipmentId: ${shipmentId}, userId: ${userId}`);
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) return null;

  const shipment = await CustomerShipment.findById(shipmentId);
  if (!shipment) {
    console.log("[FETCH SHIPMENT] Not found");
    return null;
  }

  if (shipment.customer.toString() !== userId.toString()) {
    console.log("[FETCH SHIPMENT] Unauthorized access");
    return null;
  }

  console.log("[FETCH SHIPMENT] Found");
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

      const horseObj = {
        registeredName: h.registeredName || "",
        barnName: h.barnName || "",
        breed: h.breed || "",
        colour: h.colour || "",
        age: h.age || null,
        sex: h.sex || "",
        generalInfo: h.generalInfo || "",
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
      additionalInfo: req.body.additionalInfo || "",
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
    // console.log(`[GET SHIPMENTS] Found ${shipments.length} shipments`);
    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[GET SHIPMENTS ERROR]", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateShipmentByCustomer = async (req, res) => {
  try {
    const shipmentId = req.params.shipmentId;
    const customerId = req.user._id;

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

    // Restrict update after certain stages
    if (
      ["assigned", "picked", "in_transit", "delivered"].includes(
        shipment.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot update shipment after it is in progress",
      });
    }

    // ===== FILE MAP =====
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    // ===== BASIC FIELDS UPDATE =====
    shipment.pickupLocation =
      req.body.pickupLocation || shipment.pickupLocation;

    shipment.deliveryLocation =
      req.body.deliveryLocation || shipment.deliveryLocation;

    shipment.additionalInfo =
      req.body.additionalInfo || shipment.additionalInfo;

    shipment.publish = req.body.publish === "true" || req.body.publish === true;

    // ===== DATE RANGE UPDATE =====
    if (req.body.pickupStartDate && req.body.pickupEndDate) {
      shipment.pickupDateRange = {
        start: new Date(req.body.pickupStartDate),
        end: new Date(req.body.pickupEndDate),
      };
    }

    if (req.body.deliveryStartDate && req.body.deliveryEndDate) {
      shipment.deliveryDateRange = {
        start: new Date(req.body.deliveryStartDate),
        end: new Date(req.body.deliveryEndDate),
      };
    }

    // ===== HORSE UPDATE =====
    let horseData = req.body.horses
      ? Array.isArray(req.body.horses)
        ? req.body.horses
        : JSON.parse(req.body.horses)
      : [];

    const updatedHorses = [];

    for (let i = 0; i < horseData.length; i++) {
      const h = horseData[i];

      const horseObj = {
        registeredName: h.registeredName || "",
        barnName: h.barnName || "",
        breed: h.breed || "",
        colour: h.colour || "",
        age: h.age || null,
        sex: h.sex || "",
        generalInfo: h.generalInfo || "",
        requestedStallSize: h.stallType || "Box",
        documents: {},
      };

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

      // existing data preserve karo agar new file nahi hai
      const existingHorse = shipment.horses[i] || {};

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
    console.error("[UPDATE SHIPMENT ERROR]", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Server Error",
    });
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
      .sort({ createdAt: -1 }) // better for all statuses
      .populate("shipper", "name email phone")
      .lean();

    const finalShipments = shipments.map((s) => {
      return {
        ...s,

        // custom flags (VERY USEFUL )
        isCompleted: s.status === "delivered",
        isPending: s.status === "pending",
        isInProgress: ["assigned", "picked", "in_transit"].includes(s.status),

        // optional fields
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
    console.log("Encrypting email:", email);

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

    console.log("Using ENCRYPTION_KEY:", ENCRYPTION_KEY);

    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv
    );

    let encrypted = cipher.update(email, "utf8", "hex");
    encrypted += cipher.final("hex");

    const finalData = iv.toString("hex") + ":" + encrypted;

    console.log("Encryption successful");

    return finalData;
  } catch (err) {
    console.error("Encryption error:", err.message);
    throw err;
  }
};
// ---------------- EMAIL FUNCTION ----------------
const sendRecipientInviteEmail = async ({
  email,
  shipment,
  customerName,
  link, // receive link from publishShipment
}) => {
  try {
    console.log("Preparing email for:", email);
    console.log("Invite link:", link);

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
              shipment.pickupDate
                ? new Date(shipment.pickupDate).toLocaleDateString()
                : "N/A"
            }</td></tr>
            <tr><td><strong>Delivery Date</strong></td><td>${
              shipment.deliveryDate
                ? new Date(shipment.deliveryDate).toLocaleDateString()
                : "N/A"
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

    console.log("Recipient email sent:", email);
  } catch (err) {
    console.error("Email send error:", err.message);
  }
};

// ---------------- PUBLISH SHIPMENT ----------------
exports.publishShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    console.log("➡️ Incoming publish request for shipmentId:", shipmentId);

    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      console.log("Invalid shipment ID");
      return res.status(400).json({ message: "Invalid shipment ID" });
    }

    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: req.user._id,
    });

    console.log("Shipment fetched:", shipment?._id);

    if (!shipment) {
      console.log("Shipment not found");
      return res.status(404).json({ message: "Shipment not found" });
    }

    if (shipment.publish) {
      console.log("Shipment already published");
      return res.status(400).json({ message: "Shipment already published" });
    }

    // ---------------- PUBLISH SHIPMENT ----------------
    shipment.publish = true;
    shipment.status = "open_for_offers";
    shipment.publishedAt = new Date();

    console.log("Shipment marked as published");

    // ---------------- RECIPIENT LOGIC ----------------
    console.log("Raw recipientEmail:", shipment.recipientEmail);

    if (
      shipment.recipientEmail &&
      typeof shipment.recipientEmail === "string"
    ) {
      const normalizedEmail = shipment.recipientEmail.toLowerCase().trim();

      console.log("Normalized Email:", normalizedEmail);

      if (!normalizedEmail) {
        console.log("Email became empty after normalization");
        throw new Error("Invalid recipient email");
      }

      // generate unique invite token
      const token = crypto.randomBytes(20).toString("hex");
      shipment.inviteToken = token;
      shipment.inviteTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      console.log("Invite token generated:", token);

      // link recipient to existing user if present
      const existingUser = await Customer.findOne({
        email: normalizedEmail,
      });

      if (existingUser) {
        shipment.recipientUser = existingUser._id;
        console.log("Existing user linked:", existingUser._id);
      } else {
        console.log("No existing user found for email");
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

        console.log("Invite link generated:", link);

        await sendRecipientInviteEmail({
          email: normalizedEmail,
          shipment,
          customerName: req.user.name || "Customer",
          link,
        });

        console.log("Invite email sent");

        shipment.recipientInviteSent = true;
      } else {
        console.log("⚠️ Invite already sent, skipping email");
      }
    } else {
      console.log("⚠️ recipientEmail missing or invalid");
    }

    await shipment.save();

    console.log("Shipment saved successfully");

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
    console.log(`[DELETE SHIPMENT] Shipment ID: ${req.params.shipmentId}`);
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
    console.log("[DELETE SHIPMENT] Shipment deleted:", shipment._id);

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

    console.log("[UPDATE LOCATION] Location updated");
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
    console.log("[NOTIFY ACCEPTED] Notification sent");
  } catch (err) {
    console.error("[NOTIFY ACCEPTED ERROR]", err);
  }
};

// ============================================================
// ===================== GET AVAILABLE SHIPMENTS ==============
// ============================================================
exports.getAvailableShipments = async (req, res) => {
  try {
    console.log("[AVAILABLE SHIPMENTS] Fetching open shipments");
    const shipments = await CustomerShipment.find({
      publish: true,
      status: "open_for_offers",
      shipper: null,
    })
      .populate("customer", "name phone")
      .sort({ publishedAt: -1 });

    console.log(`[AVAILABLE SHIPMENTS] Found ${shipments.length}`);
    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[AVAILABLE SHIPMENTS ERROR]", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
