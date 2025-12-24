const Driver = require("../../../models/shipper/Driver");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ====================================================
// DRIVER LOGIN
// ====================================================
exports.driverLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const driver = await Driver.findOne({ email });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const isMatch = await bcrypt.compare(password, driver.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        id: driver._id,
        role: "driver",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
      },
    });
  } catch (error) {
    console.error("[DRIVER LOGIN]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================
// DRIVER DASHBOARD (ME)
// ====================================================
exports.getDriverDashboard = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver._id).populate(
      "assignedVehicles"
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    res.json({
      success: true,
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        notes: driver.notes,
        assignedVehicles: driver.assignedVehicles,
      },
    });
  } catch (error) {
    console.error("[DRIVER ME]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
