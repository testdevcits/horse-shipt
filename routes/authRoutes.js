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

  if (!role || !["shipper", "customer"].includes(role)) {
    return res
      .status(400)
      .send("Role is required and must be 'shipper' or 'customer'");
  }

  // Encode role into state param to retrieve later
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: Buffer.from(JSON.stringify({ role })).toString("base64"),
  })(req, res, next);
});

// ------------------------
// Step 2: Handle callback from Google
// ------------------------
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
  }),
  (req, res) => {
    try {
      // req.user.redirectUrl comes from your GoogleStrategy
      const redirectUrl = req.user?.redirectUrl;
      if (!redirectUrl)
        return res.redirect(`${process.env.FRONTEND_URL}/login`);

      res.redirect(redirectUrl);
    } catch (err) {
      console.error("OAuth redirect error:", err);
      res.redirect(`${process.env.FRONTEND_URL}/login`);
    }
  }
);

module.exports = router;
