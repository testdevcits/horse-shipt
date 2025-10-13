const { body, validationResult } = require("express-validator");

// ==========================
// Signup Validation
// ==========================
const signupValidation = [
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["shipper", "customer"])
    .withMessage("Role must be either 'shipper' or 'customer'"),
  // Remove name validation
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((err) => err.msg),
      });
    }
    next();
  },
];

// ==========================
// Login Validation
// ==========================
const loginValidation = [
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["shipper", "customer"])
    .withMessage("Role must be either 'shipper' or 'customer'"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((err) => err.msg),
      });
    }
    next();
  },
];

// ==========================
// OAuth Validation (Google/Facebook)
// ==========================
const oauthValidation = [
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["shipper", "customer"])
    .withMessage("Role must be either 'shipper' or 'customer'"),
  body("provider")
    .notEmpty()
    .withMessage("Provider is required")
    .isIn(["google", "facebook"])
    .withMessage("Provider must be 'google' or 'facebook'"),
  body("profile").notEmpty().withMessage("Profile data is required"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((err) => err.msg),
      });
    }
    next();
  },
];

module.exports = {
  signupValidation,
  loginValidation,
  oauthValidation,
};
