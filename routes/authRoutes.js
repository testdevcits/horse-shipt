const express = require("express");
const passport = require("passport");
const router = express.Router();
const authController = require("../controllers/authController");

// ------------------------
// Local signup/login/logout
// ------------------------
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// ------------------------
// Google OAuth
// ------------------------
// Step 1: Redirect user to Google for authentication
router.get(
  "/google",
  (req, res, next) => {
    // Save role in session for callback
    const { role } = req.query;
    req.session.role = role || "shipper"; // default to shipper
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Step 2: Handle callback from Google
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    // User authenticated successfully
    // Construct redirect URL for frontend
    const redirectBase =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:3000";

    // You can pass token and user info as query params
    const user = req.user;
    const redirectUrl = `${redirectBase}/auth/success?token=${user.token}&id=${
      user._id
    }&role=${user.role}&name=${encodeURIComponent(
      user.name
    )}&email=${encodeURIComponent(user.email)}&photo=${encodeURIComponent(
      user.profilePicture || ""
    )}&provider=${user.provider}&providerId=${user.providerId}`;

    res.redirect(redirectUrl);
  }
);

module.exports = router;
