const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const ShipperSettings = require("../../models/shipper/shipperSettingsModel");

const { VEHICLE_MESSAGES } = require("../../utils/response/vehicleMessages");

const { sendShipperEmail } = require("../../utils/shipperMailSend");
const { sendShipperSms } = require("../../utils/shipperSmsSend");

const { verifyVINData } = require("../../services/vinVerificationService");

const {
  vehicleVerificationMailTemplate,
} = require("../../utils/mailTemplates/vehicleVerificationMail");

// ====================================================
// VERIFY OR REJECT VEHICLE (ADMIN ACTION)
// ====================================================
exports.verifyVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { status, message } = req.body;

    // Status Validation
    if (!["VERIFIED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: VEHICLE_MESSAGES.INVALID_STATUS,
      });
    }

    // Find Vehicle
    const vehicle = await ShipperVehicle.findById(vehicleId).populate(
      "shipper",
      "name email phone"
    );

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: VEHICLE_MESSAGES.VEHICLE_NOT_FOUND,
      });
    }

    // VIN Background Verification (Only if VERIFIED)
    if (vehicle.vinNumber && status === "VERIFIED") {
      try {
        const vinResult = await verifyVINData(vehicle.vinNumber);
        vehicle.vinMetaData = vinResult || null;
      } catch (vinError) {
        console.error("VIN Verification Error:", vinError.message);
      }
    }

    // Update Status
    vehicle.verificationStatus = status;

    if (message) {
      vehicle.notes = message;
    }

    await vehicle.save();

    // ====================================================
    // Notification System (Settings Based)
    // ====================================================

    const shipper = vehicle.shipper;

    if (shipper) {
      const settings = await ShipperSettings.findOne({
        shipperId: shipper._id,
      });

      const shipmentNotif = settings?.notifications?.shipment;

      const htmlMail = vehicleVerificationMailTemplate(
        vehicle.vehicleNumber,
        status,
        message
      );

      // Email Send Check
      if (shipmentNotif?.email && shipper.email) {
        await sendShipperEmail(
          shipper._id,
          "Vehicle Verification Status",
          htmlMail
        );
      }

      // SMS Send Check
      if (shipmentNotif?.sms && shipper.phone) {
        await sendShipperSms(
          shipper._id,
          `Vehicle (${vehicle.vehicleNumber}) status: ${status}`
        );
      }
    }

    res.status(200).json({
      success: true,
      message: VEHICLE_MESSAGES.VEHICLE_STATUS_UPDATED,
      vehicle,
    });
  } catch (error) {
    console.error("Verification Error:", error);

    res.status(500).json({
      success: false,
      message: VEHICLE_MESSAGES.SERVER_ERROR,
    });
  }
};

exports.getVerificationQueue = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const skip = (page - 1) * limit;

    const vehicles = await ShipperVehicle.find({
      verificationStatus: "PENDING",
    })
      .populate("shipper", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await ShipperVehicle.countDocuments({
      verificationStatus: "PENDING",
    });

    res.status(200).json({
      success: true,
      message: VEHICLE_MESSAGES.VEHICLE_FETCHED,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      vehicles,
    });
  } catch (error) {
    console.error("Queue Fetch Error:", error);

    res.status(500).json({
      success: false,
      message: VEHICLE_MESSAGES.SERVER_ERROR,
    });
  }
};
