const jwt = require("jsonwebtoken");
const Driver = require("../../models/shipper/Driver");

module.exports = async (req, res, next) => {
  try {
    // Get token from headers
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find driver by ID
    const driver = await Driver.findById(decoded.id).populate(
      "assignedVehicles"
    );
    if (!driver) {
      return res.status(401).json({ message: "Unauthorized driver" });
    }

    // Check role
    if (driver.role !== "driver") {
      return res
        .status(403)
        .json({ message: "Access forbidden: not a driver" });
    }

    // Attach driver to request
    req.driver = driver;
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: "Invalid token" });
  }
};
