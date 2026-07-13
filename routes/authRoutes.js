const express = require("express");
const passport = require("passport");

const router = express.Router();
const authController = require("../controllers/authController");

// ------------------------
// OAuth Error Redirect
// ------------------------
const redirectOAuthError = (res, message) => {
  return res.redirect(
    `${process.env.FRONTEND_URL}/oauth-error?message=${encodeURIComponent(
      message || "Authentication failed"
    )}`
  );
};

// ------------------------
// Local auth
// ------------------------
router.post("/signup", authController.signup);
router.post("/signup/verify-otp", authController.verifySignupOtp);
router.post("/signup/resend-otp", authController.resendSignupOtp);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-reset-otp", authController.verifyResetOtp);
router.post("/reset-password", authController.resetPassword);

// ========================
// GOOGLE OAUTH START
// ========================
router.get("/google", (req, res, next) => {
  const role = req.query.role;
  const intent = req.query.intent || req.query.action || "login";
  // intent = login | signup | link (NOT subscription trigger)

  // ------------------------
  // VALIDATE ROLE
  // ------------------------
  if (!["shipper", "customer"].includes(role)) {
    return redirectOAuthError(res, "Invalid role selected");
  }

  // ------------------------
  // FORCE SAFE INTENT ONLY
  // ------------------------
  if (!["login", "signup", "link"].includes(intent)) {
    return redirectOAuthError(res, "Invalid OAuth intent");
  }

  // ------------------------
  // STATE ENCODE
  // ------------------------
  const state = Buffer.from(
    JSON.stringify({
      role,
      intent,
      action: intent,
      timestamp: Date.now(),
    })
  ).toString("base64");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
    prompt: "select_account",
  })(req, res, next);
});

// ========================
// GOOGLE CALLBACK
// ========================
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user, info) => {
    try {
      if (err) {
        console.error("OAuth Error:", err);
        return redirectOAuthError(res, err.message);
      }

      if (!user) {
        return redirectOAuthError(
          res,
          info?.message || "Google authentication failed"
        );
      }

      if (!user.redirectUrl) {
        return redirectOAuthError(res, "Missing redirect URL");
      }

      // =========================
      // IMPORTANT FIX:
      // DO NOT TRIGGER SUBSCRIPTION HERE
      // =========================

      // Only login session should happen here
      // subscription must be manually triggered by frontend action

      return res.redirect(user.redirectUrl);
    } catch (error) {
      console.error("OAuth Callback Error:", error);
      return redirectOAuthError(res, "Something went wrong");
    }
  })(req, res, next);
});

module.exports = router;
