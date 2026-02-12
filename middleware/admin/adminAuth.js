const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
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

    // 🔹 Allow admin & super-admin
    if (!["admin", "super-admin"].includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only.",
      });
    }

    // 🔹 Attach admin info to request
    req.admin = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};
