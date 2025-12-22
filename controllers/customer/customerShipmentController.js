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
      // Convert buffer to base64 string
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

    console.log(
      `Uploaded ${file.originalname} to Cloudinary:`,
      uploadResult.secure_url
    );
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

// ---------------- Helper: Fetch Shipment ----------------
exports.fetchShipmentById = async (shipmentId, userId) => {
  const shipment = await CustomerShipment.findById(shipmentId);
  if (!shipment) return null;
  if (shipment.customer.toString() !== userId.toString()) return null;
  return shipment;
};

// ---------------- Create Shipment ----------------
exports.createShipment = async (req, res) => {
  console.log("================================================");
  console.log("CREATE SHIPMENT API HIT");
  console.log("Time:", new Date().toISOString());
  console.log("================================================");

  try {
    const customerId = req.user?._id;

    console.log("Customer ID:", customerId);
    console.log("Raw Request Body:", req.body);
    console.log("Uploaded Files Count:", req.files?.length || 0);

    // ---------------- Validate number of horses ----------------
    const numberOfHorses = parseInt(req.body.numberOfHorses || "0", 10);

    console.log("Parsed numberOfHorses:", numberOfHorses);

    if (isNaN(numberOfHorses) || numberOfHorses < 1) {
      console.error("Invalid numberOfHorses");
      return res.status(400).json({
        success: false,
        message: "Invalid numberOfHorses",
      });
    }

    // ---------------- Extract shipment fields ----------------
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

    console.log("Pickup:", pickupLocation, pickupDate);
    console.log("Delivery:", deliveryLocation, deliveryDate);
    console.log("Publish Flag:", publish);

    // ---------------- File Mapping ----------------
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
      console.log("File mapped:", file.fieldname);
    });

    // ---------------- Parse Horse Data ----------------
    let horseData = [];

    if (req.body.horses) {
      horseData = Array.isArray(req.body.horses)
        ? req.body.horses
        : JSON.parse(req.body.horses);
    }

    console.log("Horse Data Count:", horseData.length);

    const horses = [];

    // ---------------- Build Horse Objects ----------------
    for (let i = 0; i < horseData.length; i++) {
      const h = horseData[i];

      console.log(`Processing Horse #${i + 1}`, h);

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

      if (photoFile) {
        console.log(`Uploading photo for horse ${i + 1}`);
        horseObj.photo = await uploadToCloudinary(photoFile);
      }

      if (coginsFile) {
        console.log(`Uploading cogins for horse ${i + 1}`);
        horseObj.cogins = await uploadToCloudinary(coginsFile);
      }

      if (healthFile) {
        console.log(`Uploading health certificate for horse ${i + 1}`);
        horseObj.healthCertificate = await uploadToCloudinary(healthFile);
      }

      horses.push(horseObj);
    }

    console.log("Horses processed successfully");

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
      additionalInfo: additionalInfo || "",
      horses,
      publish: publish === "true" || publish === true,
      status: "pending",
    });

    console.log("Shipment Object Before Save:", shipment);

    await shipment.save();

    console.log(" Shipment saved successfully");
    console.log(" Shipment ID:", shipment._id);

    // ---------------- Push Notification ----------------
    console.log("Checking notification settings...");

    const notif = await CustomerNotification.findOne({ user: customerId });

    if (notif?.subscription && notif?.settings?.shipmentUpdates) {
      console.log("Sending push notification");

      const payload = JSON.stringify({
        title: "Shipment Created",
        body: `Your shipment for ${pickupDate} has been created successfully.`,
        type: "shipment_update",
      });

      try {
        await webpush.sendNotification(notif.subscription, payload);
        console.log("Push notification sent");
      } catch (err) {
        console.error("Push notification failed", err);

        if (err.statusCode === 410 || err.statusCode === 404) {
          notif.subscription = null;
          await notif.save();
          console.log("Cleared invalid subscription");
        }
      }
    }

    console.log("CREATE SHIPMENT COMPLETED");
    console.log("================================================");

    res.status(201).json({ success: true, shipment });
  } catch (error) {
    console.error("CREATE SHIPMENT ERROR:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Shipments By Customer ----------------
exports.getShipmentsByCustomer = async (req, res) => {
  console.log("GET SHIPMENTS BY CUSTOMER");
  console.log("Customer ID:", req.user._id);

  try {
    const shipments = await CustomerShipment.find({
      customer: req.user._id,
    }).sort({ createdAt: -1 });

    console.log("Shipments Found:", shipments.length);

    res.status(200).json({ success: true, shipments });
  } catch (error) {
    console.error("Error fetching shipments:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---------------- Get Shipment By ID ----------------
exports.getShipmentById = async (req, res) => {
  console.log("GET SHIPMENT BY ID");
  console.log("Shipment ID:", req.params.shipmentId);
  console.log("Customer ID:", req.user._id);

  try {
    const shipment = await exports.fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );

    if (!shipment) {
      console.warn("⚠️ Shipment not found");
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    console.log("Shipment fetched successfully");
    res.status(200).json({ success: true, shipment });
  } catch (error) {
    console.error("Error fetching shipment:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getAvailableShipments = async (req, res) => {
  try {
    console.log("Shipper dashboard fetching available shipments");

    const shipments = await CustomerShipment.find({
      publish: true,
      status: "pending",
      shipper: null,
    })
      .populate("customer", "name phone")
      .sort({ publishedAt: -1 });

    console.log("Available shipments:", shipments.length);

    res.status(200).json({
      success: true,
      shipments,
    });
  } catch (err) {
    console.error("Error fetching available shipments", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.publishShipment = async (req, res) => {
  try {
    //  Ensure user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { shipmentId } = req.params;

    //  Validate shipmentId
    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res.status(400).json({ message: "Invalid shipment ID" });
    }

    //  Find shipment for this user
    const shipment = await CustomerShipment.findOne({
      _id: shipmentId,
      customer: req.user._id,
    });

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }

    //  Update shipment fields
    shipment.publish = true;
    shipment.status = "open_for_offers";
    shipment.publishedAt = new Date();

    //  Save shipment
    const savedShipment = await shipment.save();

    console.log(
      `Shipment ${savedShipment._id} published by customer ${req.user._id}`
    );

    //  Return success response
    res.json({ success: true, shipment: savedShipment });
  } catch (err) {
    console.error("Publish shipment error:", err);
    res.status(500).json({ message: err.message || "Server error" });
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

    // Map files for easy access
    const fileMap = {};
    (req.files || []).forEach((f) => {
      fileMap[f.fieldname] = f;
    });

    if (updateData.horses) {
      const horseData = Array.isArray(updateData.horses)
        ? updateData.horses
        : JSON.parse(updateData.horses);

      for (let i = 0; i < horseData.length; i++) {
        const h = horseData[i];
        const existingHorse = shipment.horses[i] || {};

        const photoFile = fileMap[`horses[${i}][photo]`];
        const coginsFile = fileMap[`horses[${i}][cogins]`];
        const healthFile = fileMap[`horses[${i}][healthCertificate]`];

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
  console.log("Delete shipment request");

  try {
    const shipment = await exports.fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    // Prevent delete after publish
    if (shipment.publish === true) {
      return res.status(400).json({
        success: false,
        message: "Published shipment cannot be deleted",
      });
    }

    // Prevent delete after moving forward
    if (shipment.status !== "draft") {
      return res.status(400).json({
        success: false,
        message: "Shipment cannot be deleted at this stage",
      });
    }

    console.log("Deleting shipment:", shipment._id);

    // Delete horse files
    for (const h of shipment.horses) {
      if (h.photo?.public_id) {
        console.log("Deleting photo:", h.photo.public_id);
        await deleteFromCloudinary(h.photo.public_id);
      }

      if (h.cogins?.public_id) {
        console.log("Deleting cogins:", h.cogins.public_id);
        await deleteFromCloudinary(h.cogins.public_id);
      }

      if (h.healthCertificate?.public_id) {
        console.log(
          "Deleting health certificate:",
          h.healthCertificate.public_id
        );
        await deleteFromCloudinary(h.healthCertificate.public_id);
      }
    }

    await shipment.deleteOne();

    console.log("Shipment deleted successfully");

    res.status(200).json({
      success: true,
      message: "Shipment deleted successfully",
    });
  } catch (error) {
    console.error("Delete shipment error:", error);
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
