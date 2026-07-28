const express = require("express");
const Customer = require("../../models/customer/customerModel");
const Shipper = require("../../models/shipper/shipperModel");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const [customers, shippers] = await Promise.all([
      Customer.countDocuments({ isActive: true }),
      Shipper.countDocuments({ isActive: true }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        customers,
        shippers,
        users: customers + shippers,
      },
    });
  } catch (error) {
    console.error("Platform stats fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform stats",
    });
  }
});

module.exports = router;
