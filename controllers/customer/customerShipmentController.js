const CustomerShipment = require("../../models/customer/CustomerShipment");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");
const cloudinary = require("../../utils/cloudinary");
const webpush = require("web-push");
const mongoose = require("mongoose");

// ---------------- Helper: Upload to Cloudinary ----------------
const uploadToCloudinary = async (file, folder = "shipments") => {
  if (!file) return null;
  try {
    let uploadResult;

    if (file.buffer) {
      const dataUri = `data:${file.mimetype};base64,${file.buffer.toString(
        "base64"
      )}`;
      uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder,
        resource_type: "auto",
      });
    } else if (file.path) {
      uploadResult = await cloudinary.uploader.upload(file.path, {
        folder,
        resource_type: "auto",
      });
    } else {
      return null;
    }

    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    return { url: null, public_id: null };
  }
};

// ---------------- Helper: Delete from Cloudinary ----------------
const deleteFromCloudinary = async (public_id) => {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id);
  } catch (err) {
    console.error("Cloudinary delete error:", err);
  }
};

// ---------------- Helper: Fetch Shipment By ID ----------------
exports.fetchShipmentById = async (shipmentId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(shipmentId)) return null;

  const shipment = await CustomerShipment.findById(shipmentId);
  if (!shipment) return null;

  if (shipment.customer.toString() !== userId.toString()) return null;
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

    // ---------------- File Map ----------------
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    // ---------------- Parse Horses ----------------
    let horseData = [];
    if (req.body.horses) {
      horseData = Array.isArray(req.body.horses)
        ? req.body.horses
        : JSON.parse(req.body.horses);
    }

    if (horseData.length !== numberOfHorses) {
      return res.status(400).json({
        success: false,
        message: "numberOfHorses does not match horse details",
      });
    }

    const horses = [];

    for (let i = 0; i < horseData.length; i++) {
      const h = horseData[i];

      // ---------- Mandatory validations ----------
      if (!h.registeredName || !h.breed || !h.sex || !h.requestedStallSize) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields for horse ${i + 1}`,
        });
      }

      if (h.breed === "Other Breed" && !h.otherBreed) {
        return res.status(400).json({
          success: false,
          message: `Other breed is required for horse ${i + 1}`,
        });
      }

      // ---------- Horse Object ----------
      const horseObj = {
        registeredName: h.registeredName,
        barnName: h.barnName || "",
        breed: h.breed,
        otherBreed: h.otherBreed || "",
        sex: h.sex,
        size: h.size || "",
        requestedStallSize: h.requestedStallSize,
        generalInfo: h.generalInfo || "",
        documents: {},
      };

      // ---------- Photo ----------
      if (fileMap[`horses[${i}][photo]`]) {
        horseObj.photo = await uploadToCloudinary(
          fileMap[`horses[${i}][photo]`]
        );
      }

      // ---------- Documents ----------
      if (fileMap[`horses[${i}][coggins]`]) {
        horseObj.documents.coggins = await uploadToCloudinary(
          fileMap[`horses[${i}][coggins]`]
        );
      }

      if (fileMap[`horses[${i}][healthCertificate]`]) {
        horseObj.documents.healthCertificate = await uploadToCloudinary(
          fileMap[`horses[${i}][healthCertificate]`]
        );
      }

      if (fileMap[`horses[${i}][otherDocument]`]) {
        horseObj.documents.other = await uploadToCloudinary(
          fileMap[`horses[${i}][otherDocument]`]
        );
      }

      horses.push(horseObj);
    }

    // ---------------- Create Shipment ----------------
    const shipment = new CustomerShipment({
      customer: customerId,
      pickupLocation,
      pickupTimeOption,
      pickupDate,
      deliveryLocation,
      deliveryTimeOption,
      deliveryDate,
      numberOfHorses,
      horses,
      additionalInfo: additionalInfo || "",
      publish: publish === "true" || publish === true,
      status: "pending",
    });

    await shipment.save();

    // ---------------- Shipment Code ----------------
    if (!shipment.shipmentCode) {
      const year = new Date().getFullYear();
      const shortId = shipment._id.toString().slice(-6).toUpperCase();
      shipment.shipmentCode = `HS-SHIP-${year}-${shortId}`;
      await shipment.save();
    }

    // ---------------- Notification ----------------
    const notif = await CustomerNotification.findOne({ user: customerId });

    if (notif?.subscription && notif?.settings?.shipmentUpdates) {
      const payload = JSON.stringify({
        title: "Shipment Created",
        body: `Shipment (${shipment.shipmentCode}) successfully created`,
        type: "shipment_update",
      });

      try {
        await webpush.sendNotification(notif.subscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          notif.subscription = null;
          await notif.save();
        }
      }
    }

    return res.status(201).json({ success: true, shipment });
  } catch (err) {
    console.error("Create Shipment Error:", err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ================= GET SHIPMENTS BY CUSTOMER =================
// ============================================================
exports.getShipmentsByCustomer = async (req, res) => {
  try {
    const customerId = req.user._id;

    const shipments = await CustomerShipment.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .select(
        `
        shipmentCode
        status
        publish
        publishedAt
        pickupLocation
        pickupDate
        deliveryLocation
        deliveryDate
        numberOfHorses
        horses
        createdAt
        `
      )
      .lean();

    res.status(200).json({
      success: true,
      count: shipments.length,
      shipments,
    });
  } catch (err) {
    console.error("Get Shipments By Customer Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ==================== GET SHIPMENT BY ID =====================
// ============================================================
exports.getShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const customerId = req.user._id;

    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: customerId,
    })
      .select(
        `
        shipmentCode
        status
        publish
        publishedAt

        pickupLocation
        pickupTimeOption
        pickupDate

        deliveryLocation
        deliveryTimeOption
        deliveryDate

        numberOfHorses
        horses

        additionalInfo
        createdAt
        updatedAt
        `
      )
      .lean();

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    res.status(200).json({
      success: true,
      shipment,
    });
  } catch (err) {
    console.error("Get Shipment By Id Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ===================== PUBLISH SHIPMENT =====================
// ============================================================
exports.publishShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const customerId = req.user._id;

    // ---------- Validate ObjectId ----------
    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid shipment ID" });
    }

    // ---------- Find Shipment ----------
    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: customerId,
    });

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    // ---------- Prevent Re-Publish ----------
    if (shipment.publish) {
      return res.status(400).json({
        success: false,
        message: "Shipment already published",
      });
    }

    // ---------- Publish Shipment ----------
    shipment.publish = true;
    shipment.status = "open_for_offers";
    shipment.publishedAt = new Date();

    await shipment.save();

    res.status(200).json({
      success: true,
      message: "Shipment published successfully",
      shipment: {
        _id: shipment._id,
        shipmentCode: shipment.shipmentCode,
        status: shipment.status,
        publish: shipment.publish,
        publishedAt: shipment.publishedAt,
      },
    });
  } catch (err) {
    console.error("Publish Shipment Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// ================= AVAILABLE SHIPMENTS ======================
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
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// ===================== UPDATE LOCATION ======================
// ============================================================
exports.updateShipmentLocation = async (req, res) => {
  try {
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
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================
// ===================== NOTIFY ACCEPTED ======================
// ============================================================
exports.notifyShipmentAccepted = async (shipmentId, shipperName) => {
  try {
    // ---------- Validate shipmentId ----------
    if (!shipmentId) return;

    const shipment = await CustomerShipment.findById(shipmentId)
      .select("shipmentCode customer")
      .lean();

    if (!shipment) return;

    // ---------- Find Customer Notification ----------
    const notif = await CustomerNotification.findOne({
      user: shipment.customer,
    }).lean();

    if (!notif?.subscription || !notif?.settings?.shipmentUpdates) return;

    const payload = JSON.stringify({
      title: "Shipment Accepted",
      body: `Shipment ${shipment.shipmentCode} accepted by ${shipperName}`,
      type: "shipment_update",
      shipmentId: shipmentId,
    });

    try {
      await webpush.sendNotification(notif.subscription, payload);
    } catch (pushErr) {
      // ---------- Clean expired subscription ----------
      if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
        await CustomerNotification.updateOne(
          { user: shipment.customer },
          { $set: { subscription: null } }
        );
      } else {
        console.error("WebPush Error:", pushErr);
      }
    }
  } catch (err) {
    console.error("Notify Shipment Accepted Error:", err);
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

    if (shipment.publish)
      return res.status(400).json({
        success: false,
        message: "Published shipment cannot be deleted",
      });

    // delete horse files from cloudinary
    for (const h of shipment.horses) {
      if (h.photo?.public_id) await deleteFromCloudinary(h.photo.public_id);
      if (h.cogins?.public_id) await deleteFromCloudinary(h.cogins.public_id);
      if (h.healthCertificate?.public_id)
        await deleteFromCloudinary(h.healthCertificate.public_id);
    }

    await shipment.deleteOne();

    res.status(200).json({
      success: true,
      message: "Shipment deleted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
