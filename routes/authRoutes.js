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

//  NEW ROUTE (VERY IMPORTANT)
router.post("/verify-otp", authController.verifyOtpAndCreateAccount);

router.post("/login", authController.login);
router.post("/logout", authController.logout);

// ------------------------
// Google OAuth - Start
// ------------------------
router.get("/google", (req, res, next) => {
  const { role } = req.query;
  const action = req.query.action || "login";

  if (!["shipper", "customer"].includes(role)) {
    return redirectOAuthError(res, "Please select a valid role");
  }

  if (!["signup", "login"].includes(action)) {
    return redirectOAuthError(res, "Invalid action type");
  }

  const state = Buffer.from(JSON.stringify({ role, action })).toString(
    "base64"
  );

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
    prompt: "select_account",
  })(req, res, next);
});

// ------------------------
// Google OAuth - Callback
// ------------------------
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user, info) => {
    try {
      if (err) {
        console.error("OAuth Error:", err.message);
        return redirectOAuthError(res, err.message);
      }

      if (!user) {
        return redirectOAuthError(
          res,
          info?.message || "Authentication failed"
        );
      }

      if (!user.redirectUrl) {
        return redirectOAuthError(res, "Invalid redirect URL");
      }

      return res.redirect(user.redirectUrl);
    } catch (error) {
      console.error("OAuth Callback Error:", error);
      return redirectOAuthError(res, "Something went wrong");
    }
  })(req, res, next);
});

module.exports = router;
