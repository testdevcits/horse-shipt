const mongoose = require("mongoose");

// --------------------------- imports ---------------------------
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 600 }); // TTL = 10 min
const ShipperShipment = require("../../models/shipper/ShipperShipment");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");
const shipperMailSend = require("../../utils/shipperMailSend");
const shipperSmsSend = require("../../utils/shipperSmsSend");

/* =========================================================
   GET ALL ASSIGNED SHIPMENTS (FOR SHIPPER DASHBOARD)
========================================================= */
exports.getAssignedShipments = async (req, res) => {
  try {
    const shipperId = req.user._id;

    const shipments = await ShipperShipment.find({ shipper: shipperId })
      .populate({
        path: "shipment",
        populate: { path: "customer", select: "name email phone" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, shipments });
  } catch (err) {
    console.error("[GET ASSIGNED SHIPMENTS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* =========================================================
   GET SINGLE ASSIGNED SHIPMENT BY ID
========================================================= */
exports.getShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer",
      "name email phone"
    );

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    res.status(200).json({ success: true, shipment });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid shipment ID",
    });
  }
};

/* =========================================================
   GET AVAILABLE SHIPMENTS (MARKETPLACE)
========================================================= */

// Utility function for distance calculation
function toRad(value) {
  return (value * Math.PI) / 180;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // KM

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

exports.getAvailableShipments = async (req, res) => {
  try {
    const { pickupDistance, dropoffDistance, stallSize, minHorses, lat, lng } =
      req.query;

    /* ===============================
       GET SHIPPER LOCATION
    =================================*/
    let shipperLocation = null;

    if (lat && lng) {
      shipperLocation = {
        lat: Number(lat),
        lng: Number(lng),
      };
    } else {
      const shipper = await Shipper.findById(req.user.id);

      if (shipper?.currentLocation) {
        shipperLocation = {
          lat: shipper.currentLocation.latitude,
          lng: shipper.currentLocation.longitude,
        };
      }
    }

    console.log("Shipper Location:", shipperLocation);

    /* ===============================
       CACHE KEY
    =================================*/
    const cleanQuery = {
      pickupDistance: pickupDistance || "",
      dropoffDistance: dropoffDistance || "",
      stallSize: stallSize || "",
      minHorses: minHorses || "",
      lat: lat || "",
      lng: lng || "",
    };

    const cacheKey = "shipments_" + JSON.stringify(cleanQuery);

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log("CACHE HIT");
      return res.status(200).json({ success: true, shipments: cachedData });
    }

    console.log("CACHE MISS");

    /* ===============================
       FETCH DATA
    =================================*/
    const assignedShipments = await ShipperShipment.find({}, "shipment");
    const assignedIds = assignedShipments.map((s) => s.shipment);

    let shipments = await CustomerShipment.find({
      publish: true,
      status: { $in: ["pending", "open_for_offers"] },
      _id: { $nin: assignedIds },
    })
      .populate("customer", "name email phone")
      .select(
        `
        shipmentCode
        pickupLocation
        pickupCoords
        pickupDate
        deliveryLocation
        deliveryCoords
        deliveryDate
        horses
        numberOfHorses
        additionalInfo
        publishedAt
        status
      `
      )
      .sort({ publishedAt: -1 });

    /* ===============================
       ADD ESTIMATED DISTANCE
    =================================*/
    let shipmentsWithDistance = shipments.map((shipment) => {
      const pickup = shipment.pickupCoords;
      const delivery = shipment.deliveryCoords;

      let distanceKm = 0;

      if (pickup && delivery) {
        distanceKm = calculateDistance(
          pickup.latitude,
          pickup.longitude,
          delivery.latitude,
          delivery.longitude
        );
      }

      return {
        ...shipment.toObject(),
        estimatedDistance: {
          km: Number(distanceKm.toFixed(2)),
          miles: Number((distanceKm * 0.621371).toFixed(2)),
        },
      };
    });

    /* ===============================
       APPLY FILTERS ( FIXED)
    =================================*/
    shipmentsWithDistance = shipmentsWithDistance.filter((shipment) => {
      let pickupOk = true,
        dropoffOk = true,
        stallOk = true,
        horsesOk = true;

      //  Pickup Distance Filter
      if (pickupDistance && shipperLocation) {
        const dist = calculateDistance(
          shipperLocation.lat,
          shipperLocation.lng,
          shipment.pickupCoords.latitude,
          shipment.pickupCoords.longitude
        );

        pickupOk = dist <= Number(pickupDistance);
      }

      //  Dropoff Distance Filter
      if (dropoffDistance && shipperLocation) {
        const dist = calculateDistance(
          shipperLocation.lat,
          shipperLocation.lng,
          shipment.deliveryCoords.latitude,
          shipment.deliveryCoords.longitude
        );

        dropoffOk = dist <= Number(dropoffDistance);
      }

      //  Stall Size
      if (stallSize) {
        stallOk = shipment.horses.some(
          (h) => h.requestedStallSize === stallSize
        );
      }

      //  Number of Horses
      if (minHorses) {
        horsesOk = shipment.numberOfHorses >= Number(minHorses);
      }

      return pickupOk && dropoffOk && stallOk && horsesOk;
    });

    /* ===============================
       SAVE CACHE
    =================================*/
    cache.set(cacheKey, shipmentsWithDistance);

    res.status(200).json({
      success: true,
      shipments: shipmentsWithDistance,
    });
  } catch (err) {
    console.error("[GET AVAILABLE SHIPMENTS] Error:", err);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/* =========================================================
   ACCEPT SHIPMENT
========================================================= */
exports.acceptShipment = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid shipment ID" });
    }

    const customerShipment = await CustomerShipment.findById(shipmentId);
    if (!customerShipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (customerShipment.status !== "open_for_offers") {
      return res.status(400).json({
        success: false,
        message: "Shipment is not available for offers",
      });
    }

    const existing = await ShipperShipment.findOne({ shipment: shipmentId });
    if (existing)
      return res.status(400).json({
        success: false,
        message: "Shipment already accepted by another shipper",
      });

    const shipperShipment = await ShipperShipment.create({
      shipper: shipperId,
      shipment: shipmentId,
      status: "assigned",
    });

    customerShipment.status = "assigned";
    customerShipment.shipper = shipperId;
    await customerShipment.save();

    const settings = await ShipperSettings.findOne({ shipperId });
    if (settings?.notifications?.shipment) {
      const msg = `New shipment assigned.\nPickup: ${customerShipment.pickupLocation}\nDelivery: ${customerShipment.deliveryLocation}`;
      if (settings.notifications.shipment.email)
        await shipperMailSend(shipperId, "Shipment Assigned", msg);
      if (settings.notifications.shipment.sms)
        await shipperSmsSend(shipperId, msg);
    }

    res.status(200).json({
      success: true,
      message: "Shipment accepted successfully",
      shipperShipment,
    });
  } catch (err) {
    console.error("[ACCEPT SHIPMENT] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* =========================================================
   UPDATE SHIPMENT STATUS
========================================================= */
exports.updateShipmentStatus = async (req, res) => {
  try {
    const shipperId = req.user._id;
    const { shipmentId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(shipmentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid shipment ID" });
    }

    const shipperShipment = await ShipperShipment.findOne({
      _id: shipmentId,
      shipper: shipperId,
    });
    if (!shipperShipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    shipperShipment.status = status;
    await shipperShipment.save();

    const customerShipment = await CustomerShipment.findById(
      shipperShipment.shipment
    );
    if (customerShipment) {
      customerShipment.status = status;
      await customerShipment.save();
    }

    res.status(200).json({ success: true, shipment: shipperShipment });
  } catch (err) {
    console.error("[UPDATE SHIPMENT STATUS] Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// controllers/shipper/shipperShipmentController.js

function toRad(value) {
  return (value * Math.PI) / 180;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius KM

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

exports.getAllPublishedShipmentsForMap = async (req, res) => {
  try {
    console.log("[SHIPPER MAP] Fetching shipments for map");

    /* ===============================
       Pagination Params
    =================================*/

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    /* ===============================
       Get Assigned Shipments
    =================================*/

    const assignedShipments = await ShipperShipment.find({}, "shipment").lean();

    const assignedIds = assignedShipments.map((s) => s.shipment);

    /* ===============================
       Fetch Available Shipments
    =================================*/

    const shipments = await CustomerShipment.find({
      publish: true,
      status: { $in: ["pending", "open_for_offers"] },
      _id: { $nin: assignedIds },
    })
      .select(
        "_id shipmentCode pickupLocation pickupCoords deliveryLocation deliveryCoords status publishedAt"
      )
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    /* ===============================
       Count Total Documents
    =================================*/

    const total = await CustomerShipment.countDocuments({
      publish: true,
      status: { $in: ["pending", "open_for_offers"] },
      _id: { $nin: assignedIds },
    });

    /* ===============================
       Enrich Shipment Response
    =================================*/

    const enrichedShipments = shipments.map((s) => {
      let distanceKm = 0;
      let distanceMiles = 0;
      let estimatedDurationHours = 0;

      const pickup = s.pickupCoords;
      const delivery = s.deliveryCoords;

      if (
        pickup?.latitude &&
        pickup?.longitude &&
        delivery?.latitude &&
        delivery?.longitude
      ) {
        distanceKm = calculateDistance(
          pickup.latitude,
          pickup.longitude,
          delivery.latitude,
          delivery.longitude
        );

        distanceMiles = distanceKm * 0.621371;

        estimatedDurationHours = distanceKm / 60;
      }

      return {
        _id: s._id,
        shipmentCode: s.shipmentCode,
        pickupLocation: s.pickupLocation,
        deliveryLocation: s.deliveryLocation,
        status: s.status,

        pickupCoords: pickup
          ? {
              lat: pickup.latitude,
              lng: pickup.longitude,
            }
          : null,

        deliveryCoords: delivery
          ? {
              lat: delivery.latitude,
              lng: delivery.longitude,
            }
          : null,

        estimatedDistance: {
          km: Number(distanceKm.toFixed(2)),
          miles: Number(distanceMiles.toFixed(2)),
        },

        estimatedDuration: Number(estimatedDurationHours.toFixed(2)),
      };
    });

    /* ===============================
       Response
    =================================*/

    return res.status(200).json({
      success: true,
      count: enrichedShipments.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      shipments: enrichedShipments,
    });
  } catch (error) {
    console.error("[SHIPPER MAP] Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error while fetching shipments for map",
    });
  }
};
