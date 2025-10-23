const CustomerShipment = require("../../models/customer/CustomerShipment");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");
const cloudinary = require("../../utils/cloudinary");
const webpush = require("web-push");

// ---------------- Helper: Upload to Cloudinary ----------------
const uploadToCloudinary = async (file, folder = "shipments") => {
  if (!file) return null;
  const result = await cloudinary.uploader.upload(file.buffer, {
    folder,
    resource_type: "auto",
  });
  return { url: result.secure_url, public_id: result.public_id };
};

// ---------------- Helper: Delete from Cloudinary ----------------
const deleteFromCloudinary = async (public_id) => {
  if (!public_id) return;
  await cloudinary.uploader.destroy(public_id);
};

// ---------------- Helper: Fetch Shipment ----------------
exports.fetchShipmentById = async (shipmentId, userId) => {
  const shipment = await CustomerShipment.findById(shipmentId);
  if (!shipment) return null;
  if (shipment.customer.toString() !== userId.toString()) return null;
  return shipment;
};

// ---------------- Create Shipment ----------------
exports.createShipment = async (req, res) => {
  try {
    const customerId = req.user._id;

    console.log("=== Incoming Shipment Request ===");
    console.log("User ID:", customerId);
    console.log("Request Body:", req.body);
    console.log("Files:", req.files);

    const numberOfHorses = parseInt(req.body.numberOfHorses || "0", 10);
    if (isNaN(numberOfHorses) || numberOfHorses < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid numberOfHorses",
      });
    }

    const {
      pickupLocation,
      pickupTimeOption,
      pickupDate,
      deliveryLocation,
      deliveryTimeOption,
      deliveryDate,
      additionalInfo,
    } = req.body;

    const horseData = req.body.horses
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

      // Find uploaded files for this horse
      const photoFile = req.files.find(
        (f) => f.fieldname === `horses[${i}][photo]`
      );
      const coginsFile = req.files.find(
        (f) => f.fieldname === `horses[${i}][cogins]`
      );
      const healthFile = req.files.find(
        (f) => f.fieldname === `horses[${i}][healthCertificate]`
      );

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
      status: "pending",
    });

    await shipment.save();
    console.log("Shipment saved:", shipment);

    // Send notification
    const notif = await CustomerNotification.findOne({ user: customerId });
    if (notif && notif.subscription && notif.settings.shipmentUpdates) {
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
        } else console.error(err);
      }
    }

    res.status(201).json({ success: true, shipment });
  } catch (error) {
    console.error("Error creating shipment:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Shipments ----------------
exports.getShipmentsByCustomer = async (req, res) => {
  try {
    const shipments = await CustomerShipment.find({
      customer: req.user._id,
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, shipments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

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
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
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

    if (updateData.horses && req.files) {
      const horseData = Array.isArray(updateData.horses)
        ? updateData.horses
        : JSON.parse(updateData.horses);

      for (let i = 0; i < horseData.length; i++) {
        const h = horseData[i];
        const existingHorse = shipment.horses[i] || {};

        const photoFile = req.files.find(
          (f) => f.fieldname === `horses[${i}][photo]`
        );
        const coginsFile = req.files.find(
          (f) => f.fieldname === `horses[${i}][cogins]`
        );
        const healthFile = req.files.find(
          (f) => f.fieldname === `horses[${i}][healthCertificate]`
        );

        if (photoFile) {
          if (existingHorse.photo?.public_id)
            await deleteFromCloudinary(existingHorse.photo.public_id);
          h.photo = await uploadToCloudinary(photoFile);
        } else if (existingHorse.photo) h.photo = existingHorse.photo;

        if (coginsFile) {
          if (existingHorse.cogins?.public_id)
            await deleteFromCloudinary(existingHorse.cogins.public_id);
          h.cogins = await uploadToCloudinary(coginsFile);
        } else if (existingHorse.cogins) h.cogins = existingHorse.cogins;

        if (healthFile) {
          if (existingHorse.healthCertificate?.public_id)
            await deleteFromCloudinary(
              existingHorse.healthCertificate.public_id
            );
          h.healthCertificate = await uploadToCloudinary(healthFile);
        } else if (existingHorse.healthCertificate)
          h.healthCertificate = existingHorse.healthCertificate;

        shipment.horses[i] = h;
      }
    }

    Object.assign(shipment, updateData);
    await shipment.save();
    res.status(200).json({ success: true, shipment });
  } catch (error) {
    console.error(error);
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

    for (const h of shipment.horses) {
      if (h.photo?.public_id) await deleteFromCloudinary(h.photo.public_id);
      if (h.cogins?.public_id) await deleteFromCloudinary(h.cogins.public_id);
      if (h.healthCertificate?.public_id)
        await deleteFromCloudinary(h.healthCertificate.public_id);
    }

    await shipment.remove();
    res
      .status(200)
      .json({ success: true, message: "Shipment deleted successfully" });
  } catch (error) {
    console.error(error);
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
  } catch (error) {
    console.error(error);
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
    if (!notif || !notif.subscription) return;
    if (!notif.settings.shipmentUpdates) return;

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
