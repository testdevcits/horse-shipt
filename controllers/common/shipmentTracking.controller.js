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
// TRACK SHIPMENT (OPTIMIZED)
// ========================================================
exports.trackShipment = async (req, res) => {
  try {
    const { quoteId } = req.params;

    console.log("\n========== TRACK SHIPMENT ==========");
    console.log("QuoteId:", quoteId);

    const role = req.user?.role;
    const userId = req.user?._id?.toString();

    console.log("User:", { role, userId });

    const quote = await ShipmentQuote.findById(quoteId)
      .select("shipment assignedDriver tripStatus status isCancelled shipperId")
      .populate({
        path: "shipment",
        select:
          "pickupLocation deliveryLocation pickupCoords deliveryCoords customerId",
      })
      .lean();

    if (!quote) {
      console.log("Shipment NOT FOUND in DB");
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const shipment = quote.shipment;

    console.log("Quote Debug:", {
      assignedDriver: quote.assignedDriver?.toString(),
      shipperId: quote.shipperId?.toString(),
      customerId: shipment?.customerId?.toString(),
      tripStatus: quote.tripStatus,
      status: quote.status,
    });

    // ================= CANCEL CHECK =================
    if (quote.isCancelled || quote.status === "cancelled") {
      console.log("Shipment is cancelled");
      return res.status(400).json({
        success: false,
        message: "Shipment is cancelled",
      });
    }

    // ================= DRIVER =================
    if (role === "driver") {
      console.log("Checking driver access...");
      if (quote.assignedDriver?.toString() !== userId) {
        console.log("Driver mismatch", {
          expected: quote.assignedDriver?.toString(),
          got: userId,
        });
        return res.status(403).json({
          success: false,
          message: "Unauthorized driver",
        });
      }
      console.log("Driver authorized");
    }

    // ================= SHIPPER =================
    if (role === "shipper") {
      console.log("Checking shipper access...");
      if (quote.shipperId?.toString() !== userId) {
        console.log("Shipper mismatch", {
          expected: quote.shipperId?.toString(),
          got: userId,
        });
        return res.status(403).json({
          success: false,
          message: "Unauthorized shipper",
        });
      }
      console.log("Shipper authorized");
    }

    // ================= CUSTOMER =================
    if (role === "customer") {
      console.log("Checking customer access...");
      if (shipment?.customerId?.toString() !== userId) {
        console.log("Customer mismatch", {
          expected: shipment?.customerId?.toString(),
          got: userId,
        });
        return res.status(403).json({
          success: false,
          message: "Unauthorized customer",
        });
      }
      console.log("Customer authorized");
    }

    // ================= DRIVER LOCATION =================
    const driver = await Driver.findById(quote.assignedDriver)
      .select("currentLocation")
      .lean();

    if (!driver?.currentLocation?.lat) {
      console.log("Driver location missing");
      return res.status(400).json({
        success: false,
        message: "Driver location not available",
      });
    }

    const pickup = shipment?.pickupCoords;
    const delivery = shipment?.deliveryCoords;

    if (!pickup || !delivery) {
      console.log("Missing pickup/delivery coords");
      return res.status(400).json({
        success: false,
        message: "Shipment coordinates missing",
      });
    }

    const driverLoc = driver.currentLocation;

    console.log("Driver Location:", driverLoc);

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

    console.log("Distances:", {
      toPickupKm: toPickupKm.toFixed(2),
      toDeliveryKm: toDeliveryKm.toFixed(2),
    });

    const avgSpeed = 50;

    console.log("SUCCESS RESPONSE");

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
    console.error("TRACK SHIPMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to track shipment",
    });
  }
};
