const jwt = require("jsonwebtoken");
const Shipper = require("../../models/shipper/shipperModel");
const Customer = require("../../models/customer/customerModel");

// Helper: return model based on role
const getModelByRole = (role) => {
  if (role === "shipper") return Shipper;
  if (role === "customer") return Customer;
  return null;
};

/**
 * Auth Middleware Factory
 * @param {Array} allowedRoles - Array of roles allowed to access this route
 */
exports.authMiddleware = (allowedRoles = []) => {
  return async (req, res, next) => {
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

      const Model = getModelByRole(decoded.role);
      if (!Model) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Invalid role",
        });
      }

      const user = await Model.findById(decoded.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: "Account is blocked",
        });
      }

      // Check if user's role is allowed for this route
      if (allowedRoles.length && !allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: insufficient permissions",
        });
      }

      req.user = user; // Attach user to request for later use
      next();
    } catch (err) {
      console.error("AuthMiddleware Error:", err);
      res.status(500).json({
        success: false,
        message: "Server error in authentication",
        errors: [err.message],
      });
    }
  };
};
