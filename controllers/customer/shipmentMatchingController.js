const PreferredArea = require("../../models/shipper/shipperPreferredAreaModel");
const Shipment = require("../../models/customer/CustomerShipment");
const Invitation = require("../../models/common/ShipmentInvitation");

// Distance (KM)
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ========================================
// FIND MATCHING SHIPPERS
// ========================================
exports.getMatchingShippers = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    // ============================
    // 1. GET SHIPMENT
    // ============================
    const shipment = await Shipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const pickup = shipment.pickupCoords;
    const delivery = shipment.deliveryCoords;

    if (!pickup || !delivery) {
      return res.status(400).json({
        success: false,
        message: "Shipment coordinates missing",
      });
    }

    // ============================
    // 2. FETCH AREAS (PICKUP + DELIVERY)
    // ============================
    const [pickupAreas, deliveryAreas] = await Promise.all([
      PreferredArea.find({
        coordinates: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [pickup.longitude, pickup.latitude],
            },
            $maxDistance: 2000000, // 2000km
          },
        },
      }),

      PreferredArea.find({
        coordinates: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [delivery.longitude, delivery.latitude],
            },
            $maxDistance: 2000000,
          },
        },
      }),
    ]);

    const allAreas = [...pickupAreas, ...deliveryAreas];

    // ============================
    // 3. FILTER BY ACTUAL RADIUS
    // ============================
    const matchedAreas = allAreas.filter((area) => {
      const [lng, lat] = area.coordinates.coordinates;

      const pickupDistance = getDistanceKm(
        pickup.latitude,
        pickup.longitude,
        lat,
        lng
      );

      const deliveryDistance = getDistanceKm(
        delivery.latitude,
        delivery.longitude,
        lat,
        lng
      );

      return (
        pickupDistance <= area.radiusKm || deliveryDistance <= area.radiusKm
      );
    });

    // ============================
    // 4. UNIQUE SHIPPERS
    // ============================
    const shipperIds = [
      ...new Set(matchedAreas.map((a) => a.shipper.toString())),
    ];

    const invitations = await Invitation.find({
      shipment: shipmentId,
      shipper: { $in: shipperIds },
    })
      .select("shipper")
      .lean();

    const invitedShippers = invitations.map((invite) =>
      invite.shipper.toString()
    );

    return res.json({
      success: true,
      count: shipperIds.length,
      shippers: shipperIds,
      invitedShippers,
    });
  } catch (error) {
    console.error("MATCHING ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
