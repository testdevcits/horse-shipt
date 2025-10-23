const express = require("express");
const router = express.Router();
const multer = require("multer");

// ---------------- Controllers ----------------
const {
  updateProfile,
  addOrUpdatePayment,
  getPaymentByUser,
  getAllPayments,
  togglePaymentStatus,
  getPaymentById,
  requestOtp,
  verifyOtp,
} = require("../../controllers/customer/customerController");

const {
  getSettings,
  updateSetting,
} = require("../../controllers/customer/customerNotificationController");

const {
  subscribeToPush,
  sendTestNotification,
} = require("../../controllers/customer/customerPushController");

const {
  createShipment,
  getShipmentsByCustomer,
  getShipmentById,
  updateShipment,
  deleteShipment,
  updateShipmentLocation,
  notifyShipmentAccepted,
  fetchShipmentById,
} = require("../../controllers/customer/customerShipmentController");

// ---------------- Middleware ----------------
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");

// ---------------- Multer Memory Storage ----------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------------- Profile ----------------
router.put(
  "/update-profile",
  customerAuth,
  upload.single("profilePicture"),
  updateProfile
);

// ---------------- Payment ----------------
router.post("/payment", customerAuth, addOrUpdatePayment);
router.get("/payment", customerAuth, getPaymentByUser);
router.get("/payment/:id", customerAuth, getPaymentById);
router.get("/payments", customerAuth, getAllPayments);
router.patch("/payment/:id/toggle", customerAuth, togglePaymentStatus);
router.post("/payment/request-otp", customerAuth, requestOtp);
router.post("/payment/verify-otp", customerAuth, verifyOtp);

// ---------------- Notifications ----------------
router.get("/notifications", customerAuth, getSettings);
router.put("/notifications/:type", customerAuth, updateSetting);

// ---------------- Push ----------------
router.post("/notifications/subscribe", customerAuth, subscribeToPush);
router.post("/test-notification", customerAuth, sendTestNotification);

// ---------------- Shipments ----------------

// Middleware to dynamically create fields for multer based on numberOfHorses
const dynamicHorseUpload = (req, res, next) => {
  const multerFields = [];

  // Step 1: parse text fields first
  multer().none()(req, res, (err) => {
    if (err) return next(err);

    // Step 2: safely parse numberOfHorses
    const numberOfHorses = parseInt(req.body.numberOfHorses || "0", 10);
    if (isNaN(numberOfHorses) || numberOfHorses < 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid numberOfHorses" });
    }

    // Step 3: generate multer fields for each horse
    for (let i = 0; i < numberOfHorses; i++) {
      multerFields.push({ name: `horses[${i}][photo]`, maxCount: 1 });
      multerFields.push({ name: `horses[${i}][cogins]`, maxCount: 1 });
      multerFields.push({
        name: `horses[${i}][healthCertificate]`,
        maxCount: 1,
      });
    }

    // Step 4: parse files
    if (multerFields.length === 0) return next();
    upload.fields(multerFields)(req, res, next);
  });
};

// ---------------- Shipments Routes ----------------

// Log all incoming shipment data
router.post(
  "/shipments",
  customerAuth,
  dynamicHorseUpload,
  (req, res, next) => {
    console.log("=== Received shipment data ===");
    console.log("Body:", req.body);
    console.log("Files:", req.files);
    next();
  },
  createShipment
);

router.get("/shipments", customerAuth, getShipmentsByCustomer);
router.get("/shipments/:shipmentId", customerAuth, getShipmentById);

router.put("/shipments/:shipmentId", customerAuth, async (req, res) => {
  try {
    const shipmentBefore = await fetchShipmentById(
      req.params.shipmentId,
      req.user._id
    );

    await updateShipment(
      {
        params: { shipmentId: req.params.shipmentId },
        body: req.body,
        user: req.user,
        files: req.files,
      },
      res
    );

    if (
      req.body.status === "accepted" &&
      req.body.shipper &&
      shipmentBefore?.status !== "accepted"
    ) {
      const shipperName = req.body.shipperName || "Your Shipper";
      await notifyShipmentAccepted(req.params.shipmentId, shipperName);
    }
  } catch (err) {
    console.error("Error updating shipment:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

router.delete("/shipments/:shipmentId", customerAuth, deleteShipment);
router.patch(
  "/shipments/:shipmentId/location",
  customerAuth,
  updateShipmentLocation
);

module.exports = router;
