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
      const user = req.user; // Full user object from strategy
      const token = user.token; // Token generated inside strategy

      res.json({
        success: true,
        token,
        user: {
          _id: user._id,
          uniqueId: user.uniqueId,
          name: user.name,
          email: user.email,
          role: user.role,
          provider: user.provider,
          providerId: user.providerId,
          profilePicture: user.profilePicture,
          firstName: user.firstName,
          lastName: user.lastName,
          locale: user.locale,
          emailVerified: user.emailVerified,
          isLogin: user.isLogin,
          isActive: user.isActive,
          loginHistory: user.loginHistory,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          currentDevice: user.currentDevice,
        },
      });
    } catch (err) {
      console.error("OAuth callback error:", err);
      res
        .status(500)
        .json({ success: false, message: "OAuth callback failed" });
    }
  }
);

module.exports = router;
