const jwt = require("jsonwebtoken");

/**
 * Generate a JWT token
 * @param {Object} payload - Data to encode (e.g., { id, role })
 * @param {String} [expiresIn] - Optional token expiry (default: 1h)
 * @returns {String} JWT token
 */
const generateToken = (payload, expiresIn = "1h") => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

module.exports = generateToken;
