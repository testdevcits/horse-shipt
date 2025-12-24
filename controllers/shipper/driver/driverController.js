const Driver = require("../../../models/shipper/Driver");
const jwt = require("jsonwebtoken");

// ====================================================
// DRIVER LOGIN
// ====================================================
exports.driverLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find driver by email
    const driver = await Driver.findOne({ email });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // Use schema method to compare password
    const isMatch = await driver.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: driver._id,
        role: "driver",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Respond with token and driver data
    res.json({
      success: true,
      token,
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        notes: driver.notes,
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
