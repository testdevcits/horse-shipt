const express = require("express");
const router = express.Router();

// Middleware placeholder (e.g., auth check)
const { authMiddleware } = require("../../middleware/admin/authMiddleware");

// ---------------- Shipper Dashboard ----------------
router.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Shipper dashboard API is working",
  });
});

// ---------------- Orders ----------------
router.get("/orders", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Get shipper orders API placeholder",
  });
});

router.put("/orders/:orderId/status", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Update order status API placeholder",
  });
});

// ---------------- Location ----------------
router.post("/location", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Update shipper location API placeholder",
  });
});

module.exports = router;
