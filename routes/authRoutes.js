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
router.get("/google", (req, res, next) => {
  const { role } = req.query;

  // Validate role
  if (!role || !["shipper", "customer"].includes(role)) {
    return res
      .status(400)
      .send("Role is required and must be 'shipper' or 'customer'");
  }

  // Pass role via `state` (base64 encoded JSON)
  const state = Buffer.from(JSON.stringify({ role })).toString("base64");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
  })(req, res, next);
});

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
      // Decode state parameter to get role
      let role = "shipper"; // fallback
      const { state } = req.query;

      if (state) {
        const decoded = JSON.parse(
          Buffer.from(state, "base64").toString("utf-8")
        );
        if (decoded.role && ["shipper", "customer"].includes(decoded.role)) {
          role = decoded.role;
        }
      }

      // Attach role to user object
      req.user.role = role;

      // Redirect to frontend with token and role
      const redirectUrl = `${process.env.FRONTEND_URL}/oauth-success?token=${
        req.user.token
      }&role=${role}&name=${encodeURIComponent(
        req.user.name
      )}&email=${encodeURIComponent(req.user.email)}&photo=${encodeURIComponent(
        req.user.photo || ""
      )}&provider=${encodeURIComponent(
        req.user.provider
      )}&providerId=${encodeURIComponent(req.user.providerId || "")}`;

      res.redirect(redirectUrl);
    } catch (err) {
      console.error("OAuth redirect error:", err);
      res.redirect(`${process.env.FRONTEND_URL}/login`);
    }
  }
);

module.exports = router;
