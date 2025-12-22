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
      console.log("No valid buffer or path for file:", file);
      return null;
    }
    return { url: uploadResult.secure_url, public_id: uploadResult.public_id };
  } catch (err) {
    console.error("Cloudinary upload error for file:", file.originalname, err);
    return { url: null, public_id: null };
  }
};

// ---------------- Helper: Delete from Cloudinary ----------------
const deleteFromCloudinary = async (public_id) => {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id);
  } catch (err) {
    console.error("Error deleting from Cloudinary:", err);
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

// ---------------- Create Shipment ----------------
exports.createShipment = async (req, res) => {
  try {
    const customerId = req.user?._id;
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

    // Map uploaded files
    const fileMap = {};
    (req.files || []).forEach((file) => (fileMap[file.fieldname] = file));

    // Process horse data
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
        age: h.age || "",
        sex: h.sex || "",
        generalInfo: h.generalInfo || "",
      };

      const photoFile = fileMap[`horses[${i}][photo]`];
      const coginsFile = fileMap[`horses[${i}][cogins]`];
      const healthFile = fileMap[`horses[${i}][healthCertificate]`];

      if (photoFile) horseObj.photo = await uploadToCloudinary(photoFile);
      if (coginsFile) horseObj.cogins = await uploadToCloudinary(coginsFile);
      if (healthFile)
        horseObj.healthCertificate = await uploadToCloudinary(healthFile);

      horses.push(horseObj);
    }

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

    // Send push notification if configured
    const notif = await CustomerNotification.findOne({ user: customerId });
    if (notif?.subscription && notif?.settings?.shipmentUpdates) {
      const payload = JSON.stringify({
        title: "Shipment Created",
        body: `Your shipment for ${pickupDate} has been created successfully.`,
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

    res.status(201).json({ success: true, shipment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Shipments By Customer ----------------
exports.getShipmentsByCustomer = async (req, res) => {
  try {
    const shipments = await CustomerShipment.find({
      customer: req.user._id,
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Shipment By ID ----------------
exports.getShipmentById = async (req, res) => {
  try {
    const shipment = await exports.fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    res.status(200).json({ success: true, shipment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Publish Shipment ----------------
exports.publishShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
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
    res.json({ success: true, shipment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ---------------- Get Available Shipments (Shipper) ----------------
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

// ---------------- Update Shipment ----------------
exports.updateShipment = async (req, res) => {
  try {
    const shipment = await exports.fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    const updateData = req.body;
    const fileMap = {};
    (req.files || []).forEach((f) => (fileMap[f.fieldname] = f));

    if (updateData.horses) {
      const horseData = Array.isArray(updateData.horses)
        ? updateData.horses
        : JSON.parse(updateData.horses);
      for (let i = 0; i < horseData.length; i++) {
        const h = horseData[i];
        const existingHorse = shipment.horses[i] || {};

        if (fileMap[`horses[${i}][photo]`]) {
          if (existingHorse.photo?.public_id)
            await deleteFromCloudinary(existingHorse.photo.public_id);
          h.photo = await uploadToCloudinary(fileMap[`horses[${i}][photo]`]);
        } else if (existingHorse.photo) h.photo = existingHorse.photo;

        if (fileMap[`horses[${i}][cogins]`]) {
          if (existingHorse.cogins?.public_id)
            await deleteFromCloudinary(existingHorse.cogins.public_id);
          h.cogins = await uploadToCloudinary(fileMap[`horses[${i}][cogins]`]);
        } else if (existingHorse.cogins) h.cogins = existingHorse.cogins;

        if (fileMap[`horses[${i}][healthCertificate]`]) {
          if (existingHorse.healthCertificate?.public_id)
            await deleteFromCloudinary(
              existingHorse.healthCertificate.public_id
            );
          h.healthCertificate = await uploadToCloudinary(
            fileMap[`horses[${i}][healthCertificate]`]
          );
        } else if (existingHorse.healthCertificate)
          h.healthCertificate = existingHorse.healthCertificate;

        shipment.horses[i] = h;
      }
    }

    Object.assign(shipment, updateData);
    await shipment.save();
    res.status(200).json({ success: true, shipment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Delete Shipment ----------------
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
      return res
        .status(400)
        .json({
          success: false,
          message: "Published shipment cannot be deleted",
        });
    if (shipment.status !== "draft")
      return res
        .status(400)
        .json({
          success: false,
          message: "Shipment cannot be deleted at this stage",
        });

    for (const h of shipment.horses) {
      if (h.photo?.public_id) await deleteFromCloudinary(h.photo.public_id);
      if (h.cogins?.public_id) await deleteFromCloudinary(h.cogins.public_id);
      if (h.healthCertificate?.public_id)
        await deleteFromCloudinary(h.healthCertificate.public_id);
    }

    await shipment.deleteOne();
    res
      .status(200)
      .json({ success: true, message: "Shipment deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Update Shipment Location ----------------
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

// ---------------- Notify Customer ----------------
exports.notifyShipmentAccepted = async (shipmentId, shipperName) => {
  try {
    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) return;

    const notif = await CustomerNotification.findOne({
      user: shipment.customer,
    });
    if (!notif?.subscription || !notif.settings.shipmentUpdates) return;

    const payload = JSON.stringify({
      title: "Shipment Accepted",
      body: `Your shipment for ${shipment.pickupDate} has been accepted by ${shipperName}.`,
      type: "shipment_update",
    });

    try {
      await webpush.sendNotification(notif.subscription, payload);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        notif.subscription = null;
        await notif.save();
      } else console.error(err);
    }
  } catch (err) {
    console.error(err);
  }
};
