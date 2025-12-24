const jwt = require("jsonwebtoken");
const Driver = require("../../models/shipper/Driver");

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const driver = await Driver.findById(decoded.id);
    if (!driver) {
      return res.status(401).json({ message: "Unauthorized driver" });
    }

    req.driver = driver;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
