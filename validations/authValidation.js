const { body, validationResult } = require("express-validator");

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => err.msg),
    });
  }
  next();
};

// ---------------- Signup Validation ----------------
const signupValidation = [
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["shipper", "customer"])
    .withMessage("Role must be either 'shipper' or 'customer'")
    .trim(),
  body("email")
    .isEmail()
    .withMessage("Valid email is required")
    .trim()
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one number")
    .matches(/[@$!%*?&]/)
    .withMessage("Password must contain at least one special character"),
  handleValidationErrors,
];

// ---------------- Login Validation ----------------
const loginValidation = [
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["shipper", "customer"])
    .withMessage("Role must be either 'shipper' or 'customer'")
    .trim(),
  body("email")
    .isEmail()
    .withMessage("Valid email is required")
    .trim()
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  handleValidationErrors,
];

// ---------------- Google OAuth Validation ----------------
const googleOAuthValidation = [
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["shipper", "customer"])
    .withMessage("Role must be either 'shipper' or 'customer'")
    .trim(),
  body("profile")
    .notEmpty()
    .withMessage("Google profile is required")
    .isObject()
    .withMessage("Profile must be a valid object"),
  handleValidationErrors,
];

module.exports = { signupValidation, loginValidation, googleOAuthValidation };
