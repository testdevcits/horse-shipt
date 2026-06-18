const { apiResponse } = require("../../responses/api.response");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const Driver = require("../../models/shipper/Driver");

// ================= DISTANCE FUNCTION =================
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ========================================================
// TRACK SHIPMENT (UPDATED)
// ========================================================
exports.trackShipment = async (req, res) => {
  try {
    const { quoteId } = req.params;

    // ================= GET DATA =================
    const quote = await ShipmentQuote.findById(quoteId)
      .select("shipment assignedDriver tripStatus status isCancelled")
      .populate({
        path: "shipment",
        select: "pickupLocation deliveryLocation pickupCoords deliveryCoords",
      })
      .lean();

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    // ================= BLOCK CANCELLED =================
    if (quote.isCancelled || quote.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: apiResponse.SHIPMENT_IS_CANCELLED,
      });
    }

    // ================= DRIVER SECURITY ONLY =================
    if (
      req.user.role === "driver" &&
      quote.assignedDriver?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: apiResponse.UNAUTHORIZED_DRIVER,
      });
    }

    // ================= DRIVER LOCATION =================
    const driver = await Driver.findById(quote.assignedDriver)
      .select("currentLocation")
      .lean();

    if (!driver?.currentLocation?.lat) {
      return res.status(400).json({
        success: false,
        message: apiResponse.DRIVER_LOCATION_NOT_AVAILABLE,
      });
    }

    const shipment = quote.shipment;
    const pickup = shipment?.pickupCoords;
    const delivery = shipment?.deliveryCoords;

    if (!pickup || !delivery) {
      return res.status(400).json({
        success: false,
        message: apiResponse.SHIPMENT_COORDINATES_MISSING,
      });
    }

    // ================= CALCULATIONS =================
    const driverLoc = driver.currentLocation;

    const toPickupKm = calculateDistance(
      driverLoc.lat,
      driverLoc.lng,
      pickup.latitude,
      pickup.longitude
    );

    const toDeliveryKm = calculateDistance(
      driverLoc.lat,
      driverLoc.lng,
      delivery.latitude,
      delivery.longitude
    );

    const avgSpeed = 50;

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      tripStatus: quote.tripStatus,

      driver: {
        lat: driverLoc.lat,
        lng: driverLoc.lng,
        heading: driverLoc.heading || 0,
        updatedAt: driverLoc.updatedAt,
      },

      pickup: {
        location: shipment.pickupLocation,
        lat: pickup.latitude,
        lng: pickup.longitude,
        distanceKm: Number(toPickupKm.toFixed(2)),
        etaMinutes: Math.round((toPickupKm / avgSpeed) * 60),
      },

      delivery: {
        location: shipment.deliveryLocation,
        lat: delivery.latitude,
        lng: delivery.longitude,
        distanceKm: Number(toDeliveryKm.toFixed(2)),
        etaMinutes: Math.round((toDeliveryKm / avgSpeed) * 60),
      },
    });
  } catch (error) {
    console.error("[TRACK SHIPMENT ERROR]", error);

    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_TRACK_SHIPMENT,
    });
  }
};
