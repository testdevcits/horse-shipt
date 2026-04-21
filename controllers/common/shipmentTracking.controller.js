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
// TRACK SHIPMENT
// ========================================================
exports.trackShipment = async (req, res) => {
  try {
    const { quoteId } = req.params;

    // ================= GET QUOTE =================
    const quote = await ShipmentQuote.findById(quoteId)
      .populate("shipment")
      .populate("vehicle")
      .lean();

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ================= CHECK ACCESS =================
    const role = req.user.role;

    if (
      role === "driver" &&
      quote.assignedDriver?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized driver",
      });
    }

    // ================= DRIVER =================
    const driver = await Driver.findById(quote.assignedDriver).lean();

    if (!driver?.currentLocation) {
      return res.status(400).json({
        success: false,
        message: "Driver location not available",
      });
    }

    const shipment = quote.shipment;

    const pickup = shipment?.pickupCoords;
    const delivery = shipment?.deliveryCoords;

    if (!pickup || !delivery) {
      return res.status(400).json({
        success: false,
        message: "Shipment coordinates missing",
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

      shipment: {
        id: shipment._id,
        status: quote.tripStatus,
      },

      driver: {
        id: driver._id,
        location: {
          lat: driverLoc.lat,
          lng: driverLoc.lng,
          speed: driverLoc.speed,
          heading: driverLoc.heading,
          updatedAt: driverLoc.updatedAt,
        },
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
      message: "Failed to track shipment",
    });
  }
};
