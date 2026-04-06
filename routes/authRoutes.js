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
// Step 1: Redirect user to Google
// ------------------------
router.get("/google", (req, res, next) => {
  const { role } = req.query;

  // Validate role
  if (!role || !["shipper", "customer"].includes(role)) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(
        "Please select a valid role"
      )}`
    );
  }

  const state = Buffer.from(
    JSON.stringify({
      role,
      // location: req.ip (optional future use)
    })
  ).toString("base64");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
  })(req, res, next);
});

// ------------------------
// Step 2: Handle callback
// ------------------------
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,

    failureRedirect: `${
      process.env.FRONTEND_URL
    }/login?error=${encodeURIComponent("Google authentication failed")}`,
  }),
  (req, res) => {
    try {
      const redirectUrl = req.user?.redirectUrl;

      if (!redirectUrl) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(
            "Login failed. Please try again."
          )}`
        );
      }

      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("OAuth redirect error:", err);

      return res.redirect(
        `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(
          "Something went wrong"
        )}`
      );
    }
  }
);

module.exports = router;
