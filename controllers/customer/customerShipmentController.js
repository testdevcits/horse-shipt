const CustomerShipment = require("../../models/customer/CustomerShipment");
const CustomerNotification = require("../../models/customer/CustomerNotificationModel");
const cloudinary = require("../../utils/cloudinary");
const fs = require("fs");
const webpush = require("web-push");

// ---------------- Helper: Upload to Cloudinary ----------------
const uploadToCloudinary = async (file, folder = "shipments") => {
  const result = await cloudinary.uploader.upload(file.path, { folder });
  fs.unlinkSync(file.path);
  return { url: result.secure_url, public_id: result.public_id };
};

// ---------------- Helper: Delete from Cloudinary ----------------
const deleteFromCloudinary = async (public_id) => {
  if (!public_id) return;
  await cloudinary.uploader.destroy(public_id);
};

// ---------------- Create Shipment ----------------
exports.createShipment = async (req, res) => {
  try {
    const customerId = req.user._id;
    const {
      pickupLocation,
      pickupTimeOption,
      pickupDate,
      deliveryLocation,
      deliveryTimeOption,
      deliveryDate,
      numberOfHorses,
      additionalInfo,
    } = req.body;

    let horses = [];
    if (req.body.horses) {
      const horseData = Array.isArray(req.body.horses)
        ? req.body.horses
        : JSON.parse(req.body.horses);

      for (let i = 0; i < horseData.length; i++) {
        const h = horseData[i];
        let horseObj = {
          registeredName: h.registeredName,
          barnName: h.barnName,
          breed: h.breed,
          colour: h.colour,
          age: h.age,
          sex: h.sex,
          generalInfo: h.generalInfo,
        };

        if (req.files) {
          if (req.files[`horses[${i}][photo]`])
            horseObj.photo = await uploadToCloudinary(
              req.files[`horses[${i}][photo]`][0]
            );
          if (req.files[`horses[${i}][cogins]`])
            horseObj.cogins = await uploadToCloudinary(
              req.files[`horses[${i}][cogins]`][0]
            );
          if (req.files[`horses[${i}][healthCertificate]`])
            horseObj.healthCertificate = await uploadToCloudinary(
              req.files[`horses[${i}][healthCertificate]`][0]
            );
        }

        horses.push(horseObj);
      }
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
      additionalInfo,
      horses,
      status: "pending",
    });

    await shipment.save();
    res.status(201).json({ success: true, shipment });
  } catch (error) {
    console.error("Error creating shipment:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get All Shipments by Customer ----------------
exports.getShipmentsByCustomer = async (req, res) => {
  try {
    const customerId = req.user._id;
    const shipments = await CustomerShipment.find({
      customer: customerId,
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, shipments });
  } catch (error) {
    console.error("Error fetching shipments:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Shipment by ID ----------------
exports.getShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (shipment.customer.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });

    res.status(200).json({ success: true, shipment });
  } catch (error) {
    console.error("Error fetching shipment:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Update Shipment ----------------
exports.updateShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const updateData = req.body;

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    if (shipment.customer.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });

    // Update horse files if new files uploaded
    if (updateData.horses && req.files) {
      const horseData = Array.isArray(updateData.horses)
        ? updateData.horses
        : JSON.parse(updateData.horses);
      for (let i = 0; i < horseData.length; i++) {
        const h = horseData[i];
        const existingHorse = shipment.horses[i] || {};

        if (req.files[`horses[${i}][photo]`]) {
          if (existingHorse.photo?.public_id)
            await deleteFromCloudinary(existingHorse.photo.public_id);
          h.photo = await uploadToCloudinary(
            req.files[`horses[${i}][photo]`][0]
          );
        } else if (existingHorse.photo) h.photo = existingHorse.photo;

        if (req.files[`horses[${i}][cogins]`]) {
          if (existingHorse.cogins?.public_id)
            await deleteFromCloudinary(existingHorse.cogins.public_id);
          h.cogins = await uploadToCloudinary(
            req.files[`horses[${i}][cogins]`][0]
          );
        } else if (existingHorse.cogins) h.cogins = existingHorse.cogins;

        if (req.files[`horses[${i}][healthCertificate]`]) {
          if (existingHorse.healthCertificate?.public_id)
            await deleteFromCloudinary(
              existingHorse.healthCertificate.public_id
            );
          h.healthCertificate = await uploadToCloudinary(
            req.files[`horses[${i}][healthCertificate]`][0]
          );
        } else if (existingHorse.healthCertificate)
          h.healthCertificate = existingHorse.healthCertificate;

        shipment.horses[i] = h;
      }
    }

    Object.assign(shipment, updateData);
    await shipment.save();
    res.status(200).json({ success: true, shipment });
  } catch (error) {
    console.error("Error updating shipment:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Delete Shipment ----------------
exports.deleteShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    if (shipment.customer.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });

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
    console.error("Error deleting shipment:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Update Shipment Live Location ----------------
exports.updateShipmentLocation = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { latitude, longitude } = req.body;

    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    if (shipment.customer.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });

    const newLocation = { latitude, longitude, updatedAt: new Date() };
    shipment.currentLocation = newLocation;
    shipment.locationHistory.push(newLocation);

    await shipment.save();
    res
      .status(200)
      .json({ success: true, currentLocation: shipment.currentLocation });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Notify Customer When Shipper Accepts ----------------
exports.notifyShipmentAccepted = async (shipmentId, shipperName) => {
  try {
    const shipment = await CustomerShipment.findById(shipmentId);
    if (!shipment) return;

    const notif = await CustomerNotification.findOne({
      user: shipment.customer,
    });
    if (!notif || !notif.subscription) return;
    if (!notif.settings.shipmentUpdates) return; // respect customer settings

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
      } else {
        console.error("Push notification error:", err);
      }
    }
  } catch (err) {
    console.error("Error notifying customer:", err);
  }
};
