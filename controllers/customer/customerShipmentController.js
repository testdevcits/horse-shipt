const CustomerShipment = require("../../models/customer/CustomerShipment");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");
const cloudinary = require("../../utils/cloudinary");
const webpush = require("web-push");
const mongoose = require("mongoose");

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
    // console.log("===== CREATE SHIPMENT REQUEST =====");
    // console.log("User ID:", req.user._id);
    // console.log("Request body:", req.body);
    // console.log(
    //   "Files received:",
    //   (req.files || []).map((f) => ({
    //     field: f.fieldname,
    //     name: f.originalname,
    //   }))
    // );

    const customerId = req.user._id;
    const numberOfHorses = parseInt(req.body.numberOfHorses || "0", 10);

    if (isNaN(numberOfHorses) || numberOfHorses < 1) {
      console.warn(
        "[CREATE SHIPMENT] Invalid numberOfHorses:",
        req.body.numberOfHorses
      );
      return res
        .status(400)
        .json({ success: false, message: "Invalid numberOfHorses" });
    }

    const {
      pickupLocation,
      pickupTimeOption,
      pickupDate,
      deliveryLocation,
      deliveryTimeOption,
      deliveryDate,
      additionalInfo,
      publish,
    } = req.body;

    console.log("[CREATE SHIPMENT] Shipment details:", {
      pickupLocation,
      pickupTimeOption,
      pickupDate,
      deliveryLocation,
      deliveryTimeOption,
      deliveryDate,
      numberOfHorses,
      publish,
    });

    // ---------- Map files ----------
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });
    console.log("[CREATE SHIPMENT] File map keys:", Object.keys(fileMap));

    // ---------- Horses ----------
    let horseData = req.body.horses
      ? Array.isArray(req.body.horses)
        ? req.body.horses
        : JSON.parse(req.body.horses)
      : [];
    console.log("[CREATE SHIPMENT] Number of horses parsed:", horseData.length);

    const horses = [];

    for (let i = 0; i < horseData.length; i++) {
      const h = horseData[i];

      const horseObj = {
        registeredName: h.registeredName || "",
        barnName: h.barnName || "",
        breed: h.breed || "",
        otherBreed: h.otherBreed || "",
        colour: h.colour || "",
        age: h.age || null,
        sex: h.sex || "",
        generalInfo: h.generalInfo || "",
        requestedStallSize: h.stallType || "Box",
        documents: {},
      };

      console.log(
        `[CREATE SHIPMENT] Processing horse ${i + 1}: ${
          horseObj.registeredName
        }`
      );

      // ---------- Upload files ----------
      if (fileMap[`horses[${i}][photo]`]) {
        horseObj.photo = await uploadToCloudinary(
          fileMap[`horses[${i}][photo]`],
          "photo"
        );
      }
      if (fileMap[`horses[${i}][cogins]`]) {
        horseObj.documents.coggins = await uploadToCloudinary(
          fileMap[`horses[${i}][cogins]`],
          "document"
        );
      }
      if (fileMap[`horses[${i}][healthCertificate]`]) {
        horseObj.documents.healthCertificate = await uploadToCloudinary(
          fileMap[`horses[${i}][healthCertificate]`],
          "document"
        );
      }
      if (fileMap[`horses[${i}][otherDocuments]`]) {
        horseObj.documents.other = await uploadToCloudinary(
          fileMap[`horses[${i}][otherDocuments]`],
          "document"
        );
      }

      horses.push(horseObj);
      console.log(`[CREATE SHIPMENT] Horse ${i + 1} processed`, horseObj);
    }

    // ---------- Create Shipment ----------
    const shipment = new CustomerShipment({
      customer: customerId,
      pickupLocation,
      pickupTimeOption,
      pickupDate,
      deliveryLocation,
      deliveryTimeOption,
      deliveryDate,
      numberOfHorses,
      additionalInfo: additionalInfo || "",
      horses,
      publish: publish === "true" || publish === true,
      status: "pending",
    });

    await shipment.save();
    console.log("[CREATE SHIPMENT] Shipment saved:", shipment._id);

    // ---------- Add Shipment Code ----------
    if (!shipment.shipmentCode) {
      const year = new Date().getFullYear();
      const shortId = shipment._id.toString().slice(-6).toUpperCase();
      shipment.shipmentCode = `HS-SHIP-${year}-${shortId}`;
      await shipment.save();
      // console.log(
      //   "[CREATE SHIPMENT] Shipment code generated:",
      //  shipment.shipmentCode
      // );
    }

    // ---------- Notifications ----------
    const notif = await CustomerNotification.findOne({ user: customerId });
    if (notif?.subscription && notif?.settings?.shipmentUpdates) {
      const payload = JSON.stringify({
        title: "Shipment Created",
        body: `Shipment (${shipment.shipmentCode}) successfully created`,
        type: "shipment_update",
      });

      try {
        await webpush.sendNotification(notif.subscription, payload);
        console.log("[CREATE SHIPMENT] Push notification sent");
      } catch (err) {
        // console.warn(
        //   "[CREATE SHIPMENT] Push notification failed",
        //   err.statusCode
        // );
        if (err.statusCode === 410 || err.statusCode === 404) {
          notif.subscription = null;
          await notif.save();
          // console.log(
          //   "[CREATE SHIPMENT] Subscription removed due to invalid endpoint"
          // );
        }
      }
    }

    res.status(201).json({ success: true, shipment });
  } catch (err) {
    console.error("[CREATE SHIPMENT ERROR]", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ================= GET SHIPMENTS BY CUSTOMER =================
// ============================================================
exports.getShipmentsByCustomer = async (req, res) => {
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

// ============================================================
// ===================== PUBLISH SHIPMENT =====================
// ============================================================
exports.publishShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    // console.log(`[PUBLISH SHIPMENT] Shipment ID: ${shipmentId}`);

    if (!mongoose.Types.ObjectId.isValid(shipmentId))
      return res.status(400).json({ message: "Invalid shipment ID" });

    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: req.user._id,
    });
    if (!shipment)
      return res.status(404).json({ message: "Shipment not found" });

    shipment.publish = true;
    shipment.status = "open_for_offers";
    shipment.publishedAt = new Date();

    await shipment.save();
    // console.log(
    //   "[PUBLISH SHIPMENT] Shipment published:",
    //   shipment.shipmentCode
    // );
    res.json({ success: true, shipment });
  } catch (err) {
    console.error("[PUBLISH SHIPMENT ERROR]", err);
    res.status(500).json({ message: "Server error" });
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
