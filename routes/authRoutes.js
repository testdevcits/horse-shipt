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
router.get(
  "/google",
  (req, res, next) => {
    const { role } = req.query;
    req.session.role = role || "shipper"; // Save role for callback
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    res.redirect(req.user.redirectUrl);
  }
);

module.exports = router;
