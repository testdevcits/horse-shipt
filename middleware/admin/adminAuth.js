const jwt = require("jsonwebtoken");
const HorseAdmin = require("../../models/admin/Admin");

module.exports = async (req, res, next) => {
  try {
    // 🔹 Expect: Authorization: Bearer <token>
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Token missing.",
      });
    }

    const token = authHeader.split(" ")[1];

    // 🔹 Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await HorseAdmin.findById(decoded.id).select(
      "role isActive permissions"
    );

    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: "Admin account is inactive or no longer exists.",
      });
    }

    // 🔹 Allow admin & super-admin
    if (!["admin", "super-admin"].includes(admin.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only.",
      });
    }

    // 🔹 Attach admin info to request
    req.admin = {
      id: admin._id,
      role: admin.role,
      permissions: admin.permissions || [],
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};
