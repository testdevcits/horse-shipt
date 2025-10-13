const express = require("express");
const router = express.Router();
const passport = require("passport");
require("../utils/googleOAuth");
require("../utils/facebookOAuth");
require("../utils/appleOAuth"); // optional
const authController = require("../controllers/authController");
const {
  signupValidation,
  loginValidation,
  oauthValidation,
} = require("../validations/authValidation");

// -------------------------
// Email/Password Routes
// -------------------------
router.post("/signup", signupValidation, authController.signup);
router.post("/login", loginValidation, authController.login);
router.post("/oauth", oauthValidation, authController.oauthLogin);

// -------------------------
// Google OAuth Routes
// -------------------------
router.get(
  "/google",
  (req, res, next) => {
    req.query.role = req.query.role || "shipper"; // fallback
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.REACT_APP_FRONTEND_URL}/login`,
  }),
  (req, res) => {
    const { token, user } = req.user;
    const role = req.query.role || user.role || "shipper";

    // Correct redirect to frontend
    res.redirect(
      `${process.env.REACT_APP_FRONTEND_URL}/oauth-success?token=${token}&role=${role}`
    );
  }
);

// -------------------------
// Facebook OAuth Routes
// -------------------------
router.get(
  "/facebook",
  (req, res, next) => {
    req.query.role = req.query.role || "shipper";
    next();
  },
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
  }),
  (req, res) => {
    const { token, user } = req.user;
    const role = req.query.role || user.role || "shipper";
    res.redirect(
      `${process.env.FRONTEND_URL}/oauth-success?token=${token}&role=${role}`
    );
  }
);

// -------------------------
// Apple OAuth Routes
// -------------------------
router.get(
  "/apple",
  (req, res, next) => {
    req.query.role = req.query.role || "shipper";
    next();
  },
  passport.authenticate("apple")
);

router.post(
  "/apple/callback",
  passport.authenticate("apple", {
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
  }),
  (req, res) => {
    const { token, user } = req.user;
    const role = req.query.role || user.role || "shipper";
    res.redirect(
      `${process.env.FRONTEND_URL}/oauth-success?token=${token}&role=${role}`
    );
  }
);

module.exports = router;
