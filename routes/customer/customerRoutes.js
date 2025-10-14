const express = require("express");
const router = express.Router();

// Middleware placeholder (e.g., auth check)
const { authMiddleware } = require("../../middleware/admin/authMiddleware");

// ---------------- Customer Dashboard ----------------
router.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Customer dashboard API is working",
  });
});

// ---------------- Orders ----------------
router.get("/orders", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Get customer orders API placeholder",
  });
});

router.post("/orders", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Create new order API placeholder",
  });
});

// ---------------- Location (Optional) ----------------
router.get("/location", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Get customer location API placeholder",
  });
});

module.exports = router;
