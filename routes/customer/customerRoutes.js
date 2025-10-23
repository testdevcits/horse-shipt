const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: "tmp/" }); // Temporary storage before Cloudinary

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
} = require("../../controllers/customer/customerShipmentController");

// ---------------- Middleware ----------------
const {
  customerAuth,
} = require("../../middleware/customer/customerMiddleware");

// ---------------- Profile ----------------
router.put(
  "/update-profile",
  customerAuth,
  upload.single("profilePicture"),
  updateProfile
);

// ---------------- Payment Setup ----------------
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

// ---------------- Push Subscription ----------------
router.post("/notifications/subscribe", customerAuth, subscribeToPush);
router.post("/test-notification", customerAuth, sendTestNotification);

// ---------------- Customer Shipment CRUD ----------------

// Dynamic multi-file uploads for horses
router.post(
  "/shipments",
  customerAuth,
  (req, res, next) => {
    const fields = [];
    const numberOfHorses = parseInt(req.body.numberOfHorses || "0");
    for (let i = 0; i < numberOfHorses; i++) {
      fields.push({ name: `horses[${i}][photo]` });
      fields.push({ name: `horses[${i}][cogins]` });
      fields.push({ name: `horses[${i}][healthCertificate]` });
    }
    upload.fields(fields)(req, res, next);
  },
  createShipment
);

router.get("/shipments", customerAuth, getShipmentsByCustomer);
router.get("/shipments/:shipmentId", customerAuth, getShipmentById);

// ---------------- Update Shipment ----------------
router.put("/shipments/:shipmentId", customerAuth, async (req, res) => {
  try {
    const shipmentBefore = await getShipmentById(
      { params: { shipmentId: req.params.shipmentId }, user: req.user },
      { json: () => {} } // dummy response for internal fetch
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

    // If shipment status changed to "accepted" and shipper assigned, notify customer
    if (
      req.body.status === "accepted" &&
      req.body.shipper &&
      shipmentBefore?.shipment?.status !== "accepted"
    ) {
      const shipperName = req.body.shipperName || "Your Shipper";
      await notifyShipmentAccepted(req.params.shipmentId, shipperName);
    }
  } catch (err) {
    console.error("Error updating shipment route:", err);
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
