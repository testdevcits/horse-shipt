const express = require("express");
const router = express.Router();
const passport = require("passport");
require("../utils/googleOAuth");

const authController = require("../controllers/authController");
const {
  signupValidation,
  loginValidation,
} = require("../validations/authValidation");

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

// Helper: redirect to frontend with token and user info
const redirectWithUser = (res, user) => {
  const redirectUrl = `${frontendUrl}/oauth-success?token=${user.token}&role=${
    user.role
  }&provider=${user.provider}&providerId=${
    user.providerId
  }&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(
    user.name
  )}&photo=${encodeURIComponent(user.profilePicture || "")}`;
  return res.redirect(redirectUrl);
};

// ---------------- Email/Password ----------------
router.post("/signup", signupValidation, authController.signup);
router.post("/login", loginValidation, authController.login);

// ---------------- Google OAuth ----------------
router.get(
  "/google",
  (req, res, next) => {
    req.session.role = req.query.role || "shipper";
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
  (req, res) => {
    if (!req.user || !req.user.isActive) {
      return res.redirect(`${frontendUrl}/login?error=account_blocked`);
    }
    redirectWithUser(res, req.user);
  }
);

// ---------------- Logout ----------------
router.post("/logout", authController.logout);

module.exports = router;
