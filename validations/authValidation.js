const { body, validationResult } = require("express-validator");

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

const oauthValidation = [
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["shipper", "customer"])
    .withMessage("Role must be either 'shipper' or 'customer'")
    .trim(),
  body("provider")
    .notEmpty()
    .withMessage("Provider is required")
    .isIn(["google", "facebook", "apple"])
    .withMessage("Provider must be 'google', 'facebook', or 'apple'"),
  body("profile").custom((value, { req }) => {
    if (req.body.provider !== "apple" && !value) {
      throw new Error("Profile data is required for Google/Facebook");
    }
    return true;
  }),
  body("idToken")
    .if(body("provider").equals("apple"))
    .notEmpty()
    .withMessage("idToken is required for Apple login"),
  handleValidationErrors,
];

module.exports = { signupValidation, loginValidation, oauthValidation };
