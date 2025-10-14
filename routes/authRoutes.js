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
// Step 1: Redirect user to Google for authentication
// ------------------------
router.get(
  "/google",
  (req, res, next) => {
    const { role } = req.query;
    req.session.role = role || "shipper"; // Save role for callback
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// ------------------------
// Step 2: Handle callback from Google
// ------------------------
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    try {
      const role = req.session.role || "shipper"; // fallback role
      const user = req.user;

      const redirectUrl = `${process.env.FRONTEND_URL}/oauth-success?token=${
        user.token
      }&role=${role}&email=${encodeURIComponent(
        user.email
      )}&name=${encodeURIComponent(user.name)}&photo=${encodeURIComponent(
        user.profilePicture || ""
      )}&provider=${user.provider}&providerId=${user.providerId}`;

      res.redirect(redirectUrl);
    } catch (err) {
      console.error("OAuth redirect error:", err);
      res.redirect(`${process.env.FRONTEND_URL}/login`);
    }
  }
);

module.exports = router;
