const jwt = require("jsonwebtoken");
const Customer = require("../../models/customer/customerModel");

exports.customerAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Missing or invalid token",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired token",
      });
    }

    // Only check Customer model
    const user = await Customer.findById(decoded.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Account is blocked" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("CustomerMiddleware Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error in Customer authentication",
      errors: [err.message],
    });
  }
};
