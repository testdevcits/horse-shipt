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
router.post("/logout", authController.logout);

// -------------------------
// Frontend URL
// -------------------------
const frontendUrl =
  process.env.FRONTEND_URL || process.env.REACT_APP_FRONTEND_URL || "";

// -------------------------
// Google OAuth
// -------------------------
router.get(
  "/google",
  (req, res, next) => {
    req.query.role = req.query.role || "shipper";
    next();
  },
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${frontendUrl}/login?error=oauth_failed`,
    session: false,
  }),
  function (req, res) {
    try {
      const { token, user } = req.user;
      if (!user || !user.isActive) {
        return res.redirect(`${frontendUrl}/login?error=account_blocked`);
      }
      const role = req.query.role || user.role;
      const providerId = user.providerId;
      const provider = user.provider;
      const email = user.email;
      const name = user.name;
      const photo = user.profilePicture || "";

      res.redirect(
        `${frontendUrl}/oauth-success?token=${token}&role=${role}&providerId=${providerId}&provider=${provider}&email=${email}&name=${name}&photo=${photo}`
      );
    } catch (err) {
      console.error("Google OAuth callback error:", err);
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }
);

// -------------------------
// Facebook OAuth
// -------------------------
router.get(
  "/facebook",
  (req, res, next) => {
    req.query.role = req.query.role || "shipper";
    next();
  },
  passport.authenticate("facebook", { scope: ["email"], session: false })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    failureRedirect: `${frontendUrl}/login?error=oauth_failed`,
    session: false,
  }),
  function (req, res) {
    try {
      const { token, user } = req.user;
      if (!user || !user.isActive) {
        return res.redirect(`${frontendUrl}/login?error=account_blocked`);
      }
      const role = req.query.role || user.role;
      const providerId = user.providerId;
      const provider = user.provider;
      const email = user.email;
      const name = user.name;
      const photo = user.profilePicture || "";

      res.redirect(
        `${frontendUrl}/oauth-success?token=${token}&role=${role}&providerId=${providerId}&provider=${provider}&email=${email}&name=${name}&photo=${photo}`
      );
    } catch (err) {
      console.error("Facebook OAuth callback error:", err);
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }
);

// -------------------------
// Apple OAuth
// -------------------------
router.get(
  "/apple",
  (req, res, next) => {
    req.query.role = req.query.role || "shipper";
    next();
  },
  passport.authenticate("apple", { session: false })
);

router.post(
  "/apple/callback",
  passport.authenticate("apple", {
    failureRedirect: `${frontendUrl}/login?error=oauth_failed`,
    session: false,
  }),
  function (req, res) {
    try {
      const { token, user } = req.user;
      if (!user || !user.isActive) {
        return res.redirect(`${frontendUrl}/login?error=account_blocked`);
      }
      const role = req.query.role || user.role;
      const providerId = user.providerId;
      const provider = user.provider;
      const email = user.email;
      const name = user.name;
      const photo = user.profilePicture || "";

      res.redirect(
        `${frontendUrl}/oauth-success?token=${token}&role=${role}&providerId=${providerId}&provider=${provider}&email=${email}&name=${name}&photo=${photo}`
      );
    } catch (err) {
      console.error("Apple OAuth callback error:", err);
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }
);

module.exports = router;
