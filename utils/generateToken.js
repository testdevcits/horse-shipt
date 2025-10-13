const jwt = require("jsonwebtoken");

const generateToken = (payload, expiresIn = "1h") => {
  return jwt.sign(payload, process.env.JWT_SECRET || "mysecretjwt", {
    expiresIn,
  });
};

module.exports = generateToken;
