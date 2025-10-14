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
// Google OAuth - Step 1
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
// Google OAuth - Step 2
// ------------------------
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    try {
      const user = req.user;
      const redirectUrl = `${process.env.FRONTEND_URL}/oauth-success?token=${
        user.token
      }&id=${user._id}&role=${user.role}&name=${encodeURIComponent(
        user.name
      )}&email=${encodeURIComponent(user.email)}&photo=${encodeURIComponent(
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
