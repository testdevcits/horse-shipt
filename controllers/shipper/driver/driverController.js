const { apiResponse } = require("../../../responses/api.response");
const Driver = require("../../../models/shipper/Driver");
const ShipmentQuote = require("../../../models/shipper/ShipmentQuote");
const ShipperVehicle = require("../../../models/shipper/ShipperVehicle");
const ChatRoom = require("../../../models/chat/chatRoomModel");
const Message = require("../../../models/chat/messageModel");
const jwt = require("jsonwebtoken");
const cloudinary = require("../../../utils/cloudinary");
const CustomerShipment = require("../../../models/customer/CustomerShipment");
const sendDeliveryMail = require("../../../utils/sendDeliveryMail");
const platformSettings = require("../../../models/admin/payment/platformSettings");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const publicDriver = (driver) => {
  const doc = driver?.toObject ? driver.toObject() : driver;
  if (!doc) return null;
  delete doc.password;
  return doc;
};

const getOrCreateDriverChatRoom = async ({ shipmentId, shipperId, driverId }) => {
  const participantQuery = {
    participants: {
      $all: [
        { $elemMatch: { userId: shipperId, role: "shipper" } },
        { $elemMatch: { userId: driverId, role: "driver" } },
      ],
    },
  };

  let room = await ChatRoom.findOne({ shipment: shipmentId, ...participantQuery });

  if (!room) {
    room = await ChatRoom.create({
      shipment: shipmentId,
      participants: [
        { userId: shipperId, role: "shipper" },
        { userId: driverId, role: "driver" },
      ],
    });
  }

  return room;
};

const ensureDriverRoomParticipant = async ({ roomId, driverId }) => {
  const room = await ChatRoom.findById(roomId).lean();
  if (!room) return null;

  const isParticipant = room.participants.some(
    (participant) =>
      participant.role === "driver" &&
      participant.userId.toString() === driverId.toString()
  );

  return isParticipant ? room : null;
};

// ====================================================
// DRIVER LOGIN
// ====================================================
exports.driverLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: apiResponse.EMAIL_AND_PASSWORD_ARE_REQUIRED,
        errors: {
          ...(!email ? { email: "Email is required" } : {}),
          ...(!password ? { password: "Password is required" } : {}),
        },
      });
    }

    const driver = await Driver.findOne({ email });
    if (!driver) {
      return res.status(401).json({
        success: false,
        message: apiResponse.INVALID_CREDENTIALS,
      });
    }

    const isMatch = await driver.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: apiResponse.INVALID_CREDENTIALS,
      });
    }

    if (!driver.isActive) {
      return res.status(403).json({
        success: false,
        message: apiResponse.ACCOUNT_IS_DEACTIVATED,
      });
    }

    const token = jwt.sign(
      { id: driver._id, role: "driver" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: apiResponse.DRIVER_LOGGED_IN_SUCCESSFULLY,
      data: {
        token,
        driver: publicDriver(driver),
      },
      token,
      driver: publicDriver(driver),
    });
  } catch (error) {
    console.error("[DRIVER LOGIN]", error);
    res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_LOGIN_DRIVER,
      errors: { server: error.message },
    });
  }
};

// ====================================================
// GET DRIVER ASSIGNED SHIPMENTS (FIXED)
// ====================================================
exports.getDriverAssignedShipments = async (req, res) => {
  try {
    const driverId = req.driver._id;

    const shipments = await ShipmentQuote.find({
      assignedDriver: driverId,
    })
      .populate(
        "shipment",
        "_id shipmentCode pickupLocation deliveryLocation pickupDate deliveryDate pickupDateRange deliveryDateRange numberOfHorses horses currentLocation pickupCoords deliveryCoords status deliveredAt"
      )
      .populate("vehicle", "_id vehicleNumber vehicleType transportType trailerType numberOfStalls stallSize")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      shipments,
    });
  } catch (error) {
    console.error("[GET SHIPMENTS]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DRIVER ACCEPT SHIPMENT
// ====================================================
exports.acceptShipment = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { quoteId } = req.body;

    // check already busy
    const busy = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      status: { $in: ["driverAccepted", "inTransit"] },
    });

    if (busy) {
      return res.status(400).json({
        success: false,
        message: apiResponse.YOU_ALREADY_HAVE_AN_ACTIVE_SHIPMENT,
      });
    }

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    await ShipmentQuote.findByIdAndUpdate(quoteId, {
      assignedDriver: driverId,
      status: "driverAccepted",
    });

    res.json({
      success: true,
      message: apiResponse.SHIPMENT_ACCEPTED_SUCCESSFULLY,
    });
  } catch (error) {
    console.error("[ACCEPT SHIPMENT]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// START TRIP (IMPORTANT)
// ====================================================
exports.startTrip = async (req, res) => {
  try {

    const driverId = req.driver._id;
    const { quoteId } = req.body;

    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: apiResponse.QUOTE_ID_IS_REQUIRED,
      });
    }

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    // ✅ FIX: allow if already started / inTransit
    if (["started", "inTransit"].includes(quote.tripStatus)) {

      return res.json({
        success: true,
        message: apiResponse.TRIP_ALREADY_STARTED,
        trackingEnabled: true,
      });
    }

    if (quote.tripStatus !== "notStarted") {
      return res.status(400).json({
        success: false,
        message: apiResponse.TRIP_CANNOT_BE_STARTED,
      });
    }

    // START TRIP
    quote.tripStatus = "started";
    quote.isTrackingActive = true;
    quote.tripStartedAt = new Date();

    await quote.save();

    // VEHICLE UPDATE
    if (quote.vehicle) {
      await ShipperVehicle.findByIdAndUpdate(quote.vehicle, {
        currentShipment: quoteId,
        driverStatus: "BUSY",
      });
    }

    // DRIVER UPDATE
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "onTrip",
      isTrackingEnabled: true,
      lastActiveAt: new Date(),
    });

    return res.json({
      success: true,
      message: apiResponse.TRIP_STARTED_SUCCESSFULLY,
      trackingEnabled: true,
    });
  } catch (error) {
    console.error("[START TRIP ERROR]", error);

    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_START_TRIP,
    });
  }
};
// ====================================================
// UPDATE DRIVER LOCATION (LIVE TRACKING CORE)
// ====================================================
exports.updateDriverLocation = async (req, res) => {
  try {

    const driverId = req.driver?._id;
    const { lat, lng, speed = 0, heading = 0 } = req.body;

    // ================= VALIDATION =================
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: apiResponse.LATITUDE_AND_LONGITUDE_REQUIRED,
      });
    }

    // ================= FIND DRIVER =================
    const driver = await Driver.findById(driverId);

    if (!driver || !driver.isActive) {
      return res.status(404).json({
        success: false,
        message: apiResponse.DRIVER_NOT_FOUND_OR_INACTIVE,
      });
    }

    // ================= TRACKING CHECK =================
    if (!driver.isTrackingEnabled) {
      return res.status(400).json({
        success: false,
        message: apiResponse.TRACKING_IS_DISABLED_FOR_THIS_DRIVER,
      });
    }

    // ================= FIND ACTIVE SHIPMENT =================
    const activeShipment = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      tripStatus: { $in: ["started", "inTransit"] },
    });

    // ================= PREPARE LOCATION =================
    const locationPayload = {
      lat,
      lng,
      coordinates: {
        type: "Point",
        coordinates: [lng, lat],
      },
      speed,
      heading,
      updatedAt: new Date(),
    };

    // ================= UPDATE DRIVER =================
    await Driver.findByIdAndUpdate(driverId, {
      currentLocation: locationPayload,
      lastActiveAt: new Date(),
      driverStatus: activeShipment ? "onTrip" : "available",
    });

    // ================= UPDATE SHIPMENT =================
    if (activeShipment) {
      activeShipment.currentLocation = locationPayload;
      activeShipment.tripStatus = "inTransit";

      await activeShipment.save();
    }

    return res.json({
      success: true,
      message: apiResponse.LOCATION_UPDATED_SUCCESSFULLY,
      location: locationPayload,
      tripActive: !!activeShipment,
    });
  } catch (error) {
    console.error("[LOCATION UPDATE ERROR]", error);

    return res.status(500).json({
      success: false,
      message: apiResponse.FAILED_TO_UPDATE_LOCATION,
    });
  }
};

// ====================================================
// COMPLETE SHIPMENT
// ====================================================
exports.completeShipment = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { quoteId } = req.body;

    const quote = await ShipmentQuote.findById(quoteId);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    // ================= UPDATE SHIPMENT =================
    quote.tripStatus = "completed";
    quote.deliveredAt = new Date();
    quote.isTrackingActive = false;

    await quote.save();

    // ================= FREE VEHICLE =================
    await ShipperVehicle.findByIdAndUpdate(quote.vehicle, {
      currentShipment: null,
      driverStatus: "AVAILABLE",
    });

    // ================= FREE DRIVER =================
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "available",
    });

    // ================= RESPONSE =================
    return res.json({
      success: true,
      message: apiResponse.SHIPMENT_COMPLETED_SUCCESSFULLY,
      data: {
        quoteId: quote._id,
        deliveredAt: quote.deliveredAt,
      },
    });
  } catch (error) {
    console.error("[COMPLETE SHIPMENT]", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ====================================================
// DRIVER DASHBOARD
// ====================================================
exports.getDriverDashboard = async (req, res) => {
  try {
    const driverId = req.driver._id;

    // ================= DRIVER =================
    const driver = await Driver.findById(driverId).select(
      "_id name email phone licenseNumber role profileImage driverStatus assignedVehicles isActive"
    );
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: apiResponse.DRIVER_NOT_FOUND });

    // ================= VEHICLE =================
    const vehicle = await ShipperVehicle.findOne({ driver: driverId })
      .select(
        "_id vehicleNumber vehicleType transportType trailerType numberOfStalls stallSize driverStatus currentShipment notes images"
      )
      .populate(
        "driver",
        "_id name email phone licenseNumber role profileImage driverStatus"
      );

    // ================= ALL SHIPMENTS =================
    let allShipments = await ShipmentQuote.find({ assignedDriver: driverId })
      .select(
        "_id tripStatus totalPrice paymentStatus pickupTime estimatedArrivalTime transportType stallsRequired notes status"
      )
      .populate("vehicle", "_id vehicleNumber vehicleType transportType")
      .populate(
        "shipment",
        "_id pickupLocation deliveryLocation pickupDate deliveryDate numberOfHorses horses currentLocation pickupCoords deliveryCoords"
      );

    // ================= ACTIVE SHIPMENT =================
    let activeShipment = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      tripStatus: { $in: ["notStarted", "started", "inTransit"] },
    })
      .select(
        "_id tripStatus totalPrice paymentStatus pickupTime estimatedArrivalTime transportType stallsRequired notes status"
      )
      .populate("vehicle", "_id vehicleNumber vehicleType transportType")
      .populate(
        "shipment",
        "_id pickupLocation deliveryLocation pickupDate deliveryDate numberOfHorses horses currentLocation pickupCoords deliveryCoords"
      );

    // ================= MAP-FRIENDLY FORMAT =================
    const mapCoords = (shipment) => {
      if (!shipment?.shipment) return null;
      const { shipment: sh } = shipment;
      return {
        ...shipment._doc,
        shipment: {
          ...sh._doc,
          pickupLat: sh.pickupCoords?.latitude || null,
          pickupLng: sh.pickupCoords?.longitude || null,
          deliveryLat: sh.deliveryCoords?.latitude || null,
          deliveryLng: sh.deliveryCoords?.longitude || null,
        },
      };
    };

    allShipments = allShipments.map(mapCoords);
    activeShipment = mapCoords(activeShipment);

    return res.json({
      success: true,
      driver,
      vehicle,
      shipment: activeShipment || null,
      allShipments,
    });
  } catch (error) {
    console.error("[DRIVER DASHBOARD ERROR]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DRIVER CHAT LIST
// ====================================================
exports.getDriverChatShipments = async (req, res) => {
  try {
    const driverId = req.driver._id;

    const quotes = await ShipmentQuote.find({
      assignedDriver: driverId,
      tripStatus: { $ne: "completed" },
    })
      .populate(
        "shipment",
        "_id shipmentCode pickupLocation deliveryLocation status pickupDate deliveryDate"
      )
      .populate("shipper", "_id name email profileImage profilePicture isLogin")
      .sort({ updatedAt: -1 })
      .lean();

    const chats = quotes
      .filter((quote) => quote.shipment && quote.shipper)
      .map((quote) => ({
        _id: quote.shipper._id,
        name: quote.shipper.name || "Shipper",
        email: quote.shipper.email,
        profileImage: quote.shipper.profileImage,
        profilePicture: quote.shipper.profilePicture,
        isOnline: Boolean(quote.shipper.isLogin),
        shipmentId: quote.shipment._id,
        quoteId: quote._id,
        shipmentCode: quote.shipment.shipmentCode,
        chatTitle: `${quote.shipment.shipmentCode || "Shipment"} - ${
          quote.shipment.pickupLocation || "Pickup"
        } to ${quote.shipment.deliveryLocation || "Delivery"}`,
        pickupLocation: quote.shipment.pickupLocation,
        deliveryLocation: quote.shipment.deliveryLocation,
        status: quote.tripStatus || quote.shipment.status,
      }));

    return res.status(200).json({ success: true, chats });
  } catch (error) {
    console.error("[GET DRIVER CHATS]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load driver chats",
    });
  }
};

// ====================================================
// DRIVER OPEN CHAT ROOM
// ====================================================
exports.getOrCreateDriverChatRoom = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { shipmentId } = req.body;

    if (!shipmentId) {
      return res.status(400).json({
        success: false,
        message: "shipmentId is required",
      });
    }

    const quote = await ShipmentQuote.findOne({
      assignedDriver: driverId,
      shipment: shipmentId,
    })
      .populate("shipment", "_id shipmentCode pickupLocation deliveryLocation status")
      .populate("shipper", "_id name email profileImage profilePicture isLogin");

    if (!quote || !quote.shipper || !quote.shipment) {
      return res.status(404).json({
        success: false,
        message: "Assigned shipment chat not found",
      });
    }

    const room = await getOrCreateDriverChatRoom({
      shipmentId: quote.shipment._id,
      shipperId: quote.shipper._id,
      driverId,
    });

    return res.status(200).json({
      success: true,
      room,
      roomId: room._id,
      shipper: quote.shipper,
      shipment: quote.shipment,
    });
  } catch (error) {
    console.error("[OPEN DRIVER CHAT]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to open driver chat",
    });
  }
};

// ====================================================
// DRIVER CHAT MESSAGES
// ====================================================
exports.getDriverRoomMessages = async (req, res) => {
  try {
    const room = await ensureDriverRoomParticipant({
      roomId: req.params.roomId,
      driverId: req.driver._id,
    });

    if (!room) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this chat",
      });
    }

    const messages = await Message.find({ chatRoom: req.params.roomId }).sort({
      createdAt: 1,
    });

    return res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error("[GET DRIVER CHAT MESSAGES]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load messages",
    });
  }
};

// ====================================================
// DRIVER SEND CHAT MESSAGE
// ====================================================
exports.sendDriverRoomMessage = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const messageText = String(req.body.message || "").trim();

    if (!messageText) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const room = await ensureDriverRoomParticipant({
      roomId: req.params.roomId,
      driverId,
    });

    if (!room) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to send messages in this chat",
      });
    }

    const chatMessage = await Message.create({
      chatRoom: req.params.roomId,
      senderId: driverId,
      senderRole: "driver",
      message: messageText,
      media: [],
    });

    await ChatRoom.findByIdAndUpdate(req.params.roomId, {
      lastMessage: messageText,
      lastMessageAt: new Date(),
    });

    const io = req.app.get("io");
    if (io) io.to(req.params.roomId).emit("receiveMessage", chatMessage);

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: chatMessage,
    });
  } catch (error) {
    console.error("[SEND DRIVER CHAT MESSAGE]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};
// ====================================================
// UPDATE DRIVER PROFILE IMAGE
// ====================================================
exports.updateDriverProfileImage = async (req, res) => {
  try {
    const driverId = req.driver._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: apiResponse.IMAGE_IS_REQUIRED,
      });
    }

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      { profileImage: req.file.path },
      { new: true }
    );

    res.json({
      success: true,
      message: apiResponse.PROFILE_IMAGE_UPDATED,
      driver,
    });
  } catch (error) {
    console.error("[UPDATE DRIVER IMAGE]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DELETE DRIVER PROFILE IMAGE
// ====================================================
exports.deleteDriverProfileImage = async (req, res) => {
  try {
    const driverId = req.driver._id;

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      { profileImage: null },
      { new: true }
    );

    res.json({
      success: true,
      message: apiResponse.PROFILE_IMAGE_REMOVED,
      driver,
    });
  } catch (error) {
    console.error("[DELETE DRIVER IMAGE]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.driverSendDeliveryOtp = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    // ---------------- GET SHIPMENT ----------------
    const shipment = await CustomerShipment.findById(shipmentId).populate(
      "customer"
    );

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    // ---------------- GET ACCEPTED QUOTE ----------------
    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    }).populate({
      path: "vehicle",
      populate: {
        path: "driver",
      },
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.ACCEPTED_QUOTE_NOT_FOUND,
      });
    }

    const loggedDriverId = req.driver?._id;

    // ---------------- DRIVER CHECK ----------------
    const assignedDriverId = quote.assignedDriver || quote.vehicle?.driver?._id;

    if (
      !assignedDriverId ||
      assignedDriverId.toString() !== loggedDriverId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: apiResponse.UNAUTHORIZED_DRIVER,
      });
    }

    // ---------------- DELIVERY STATUS CHECK ----------------
    if (shipment.status === "delivered" || shipment.deliveryOtpVerified) {
      return res.status(400).json({
        success: false,
        message: apiResponse.SHIPMENT_ALREADY_DELIVERED,
      });
    }

    // ---------------- GENERATE OTP ----------------
    const otp = Math.floor(100000 + Math.random() * 900000);

    shipment.deliveryOtp = otp.toString();
    shipment.deliveryOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await shipment.save();

    // ---------------- EMAIL ----------------
    const subject = "Shipment Delivery OTP";

    const message = `
Hello ${shipment.customer?.name || ""},

Your shipment has arrived.

OTP: ${otp}

This OTP will expire in 10 minutes.

HorseShipt Team
`;

    await sendDeliveryMail(shipment.customer?.email, subject, message);

    return res.status(200).json({
      success: true,
      message: apiResponse.DRIVER_SENT_DELIVERY_OTP,
    });
  } catch (error) {
    console.error("DRIVER OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.driverVerifyDeliveryOtp = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { otp } = req.body;

    // ---------------- GET SHIPMENT ----------------
    const shipment = await CustomerShipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: apiResponse.SHIPMENT_NOT_FOUND,
      });
    }

    const loggedDriverId = req.driver?._id?.toString();

    // ---------------- GET QUOTE ----------------
    const quote = await ShipmentQuote.findOne({
      shipment: shipmentId,
      status: "accepted",
    }).populate("shipper");

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: apiResponse.ACCEPTED_QUOTE_NOT_FOUND,
      });
    }

    const assignedDriverId = quote.assignedDriver?.toString();

    if (!assignedDriverId || assignedDriverId !== loggedDriverId) {
      return res.status(403).json({
        success: false,
        message: apiResponse.UNAUTHORIZED_DRIVER,
      });
    }

    // ---------------- VALIDATION ----------------
    if (shipment.deliveryOtpVerified) {
      return res.status(400).json({
        success: false,
        message: apiResponse.ALREADY_DELIVERED,
      });
    }

    if (!otp || shipment.deliveryOtp !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: apiResponse.INVALID_OTP,
      });
    }

    if (
      !shipment.deliveryOtpExpires ||
      shipment.deliveryOtpExpires < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: apiResponse.OTP_EXPIRED,
      });
    }

    if (quote.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: apiResponse.PAYMENT_NOT_COMPLETED_YET,
      });
    }

    // ================= MARK DELIVERY FIRST =================
    shipment.status = "delivered";
    shipment.deliveredAt = new Date();
    shipment.deliveryOtpVerified = true;
    shipment.deliveryOtp = null;
    shipment.deliveryOtpExpires = null;

    await shipment.save();

    // ================= FREE VEHICLE =================
    if (quote.vehicle) {

      const vehicle = await ShipperVehicle.findById(quote.vehicle);

      if (vehicle) {

        vehicle.currentShipment = null;
        vehicle.driverStatus = "AVAILABLE";

        await vehicle.save();
      } else {
      }
    }

    // ================= FREE DRIVER =================
    if (quote.assignedDriver) {

      const driver = await Driver.findById(quote.assignedDriver);

      if (driver) {
        driver.driverStatus = "available";
        await driver.save();
      } else {
      }
    }

    // ================= PAYOUT (NON-BLOCKING) =================
    try {

      const paymentIntent = await stripe.paymentIntents.retrieve(
        quote.stripePaymentIntentId
      );

      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);

      const balanceTx = await stripe.balanceTransactions.retrieve(
        charge.balance_transaction
      );

      const grossCents = paymentIntent.amount;
      const stripeFeeCents = balanceTx.fee;
      const netAfterStripeCents = grossCents - stripeFeeCents;

      const settings = await platformSettings.findOne();

      const platformPercent = settings?.platformFeePercent || 0;
      const platformFlat = settings?.platformFeeFlat || 0;

      const platformFee =
        Math.round(netAfterStripeCents * (platformPercent / 100)) +
        Math.round(platformFlat * 100);

      const shipperCents = netAfterStripeCents - platformFee;

      const transfer = await stripe.transfers.create({
        amount: Math.max(shipperCents, 0),
        currency: balanceTx.currency,
        destination: quote.shipper.stripeAccountId,
        source_transaction: charge.id,
        transfer_group: `quote_${quote._id.toString()}`,
        metadata: {
          quoteId: quote._id.toString(),
          shipmentId: quote.shipment.toString(),
          shipperId: quote.shipper._id.toString(),
        },
      });

      quote.stripeTransferId = transfer.id;
      quote.payoutStatus = "transferred";
      quote.paymentReleasedAt = new Date();
      quote.platformFee = platformFee / 100;
      quote.balanceInWallet = 0;
    } catch (err) {

      quote.payoutStatus = "pending";
      quote.payoutError = err.message;
    }

    // ================= FINAL QUOTE =================
    quote.tripStatus = "completed";
    await quote.save();

    return res.json({
      success: true,
      message: apiResponse.DRIVER_VERIFIED_DELIVERY_VEHICLE_FREED,
    });
  } catch (error) {
    console.error("[DRIVER VERIFY ERROR]:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
