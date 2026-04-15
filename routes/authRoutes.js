const express = require("express");
const passport = require("passport");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
// Helper: Ensure Stripe Customer
// ------------------------
const ensureStripeCustomer = async (user) => {
  try {
    if (!user.stripeCustomerId) {
      console.log("Creating Stripe customer for:", user.email);

      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
      });

      user.stripeCustomerId = customer.id;
      await user.save();

      console.log("Stripe customer created:", customer.id);
    }
  } catch (error) {
    console.error("Stripe Customer Error:", error.message);
  }
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
  const { role, action } = req.query;

  // Validate role & action
  if (!role || !["shipper", "customer"].includes(role)) {
    return redirectWithError(res, "Please select a valid role");
  }

  if (!action || !["signup", "login"].includes(action)) {
    return redirectWithError(res, "Please specify action (signup or login)");
  }

  const statePayload = { role, action };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
  })(req, res, next);
});

// ------------------------
// Google OAuth - Step 2
// ------------------------
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", async (err, user, info) => {
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

      await ensureStripeCustomer(user);

      // Redirect success
      return res.redirect(user.redirectUrl);
    } catch (error) {
      console.error("OAuth Callback Error:", error);
      return redirectWithError(res, "Something went wrong");
    }
  })(req, res, next);
});

module.exports = router;
