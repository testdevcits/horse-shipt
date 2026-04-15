const express = require("express");
const passport = require("passport");

const router = express.Router();
const authController = require("../controllers/authController");

// ------------------------
// Dynamic redirect
// ------------------------
const redirectWithError = (res, message, action = "login") => {
  const path = action === "signup" ? "signup" : "login";

  return res.redirect(
    `${process.env.FRONTEND_URL}/${path}?error=${encodeURIComponent(message)}`
  );
};

// ------------------------
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// ------------------------
// Google start
// ------------------------
router.get("/google", (req, res, next) => {
  const { role } = req.query;
  const action = req.query.action || "login";

  if (!["shipper", "customer"].includes(role)) {
    return redirectWithError(res, "Invalid role", action);
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
// Google callback
// ------------------------
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user, info) => {
    let action = "login";

    try {
      const parsed = JSON.parse(
        Buffer.from(req.query.state, "base64").toString()
      );
      action = parsed.action || "login";
    } catch {}

    if (err) {
      return redirectWithError(res, err.message, action);
    }

    if (!user) {
      return redirectWithError(
        res,
        info?.message || "Authentication failed",
        action
      );
    }

    return res.redirect(user.redirectUrl);
  })(req, res, next);
});

module.exports = router;
