const express = require("express");
const passport = require("passport");

const router = express.Router();
const authController = require("../controllers/authController");

// ------------------------
// Helper: Safe redirect with error
// ------------------------
const redirectWithError = (res, message) => {
  return res.redirect(
    `${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(message)}`
  );
};

// ------------------------
// Local signup/login/logout
// ------------------------
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// ------------------------
// Google OAuth - Step 1
// ------------------------
router.get("/google", (req, res, next) => {
  const { role } = req.query;

  const action = req.query.action || "login";

  // Validate role
  if (!role || !["shipper", "customer"].includes(role)) {
    return redirectWithError(res, "Please select a valid role");
  }

  // Validate action (safe)
  if (!["signup", "login"].includes(action)) {
    return redirectWithError(res, "Invalid action type");
  }

  const statePayload = { role, action };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
  })(req, res, next);
});

// ------------------------
// Google OAuth - Step 2 (Callback)
// ------------------------
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user, info) => {
    try {
      if (err) {
        console.error("OAuth Error:", err);
        return redirectWithError(
          res,
          err.message || "Google authentication failed"
        );
      }

      if (!user) {
        return redirectWithError(res, info?.message || "Authentication failed");
      }

      return res.redirect(user.redirectUrl);
    } catch (error) {
      console.error("OAuth Callback Error:", error);
      return redirectWithError(res, "Something went wrong");
    }
  })(req, res, next);
});

module.exports = router;
