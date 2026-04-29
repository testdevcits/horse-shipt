const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const generateUniqueId = require("../utils/generateUniqueId");

// ---------------- HELPERS ----------------
const getModel = (role) => (role === "shipper" ? Shipper : Customer);

const getCallbackURL = () =>
  process.env.NODE_ENV === "production"
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI_LOCAL;

// ---------------- STRIPE CUSTOMER ----------------
const ensureStripeCustomer = async (user) => {
  try {
    if (!user || !user.email) return;
    if (user.stripeCustomerId) return;

    const existing = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    if (existing.data.length > 0) {
      user.stripeCustomerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
      });

      user.stripeCustomerId = customer.id;
    }
  } catch (err) {
    console.error("Stripe Error:", err.message);
  }
};

// ================= GOOGLE STRATEGY =================
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: getCallbackURL(),
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // ---------------- STATE ----------------
        const state = req.query.state;
        if (!state) return done(new Error("Missing state parameter"), null);

        let parsed;
        try {
          parsed = JSON.parse(Buffer.from(state, "base64").toString());
        } catch {
          return done(new Error("Invalid state parameter"), null);
        }

        const role = parsed.role;
        const action = parsed.action || "login"; // login | signup | link

        if (!["shipper", "customer"].includes(role)) {
          return done(new Error("Invalid role selected"), null);
        }

        const email =
          profile.emails?.[0]?.value || `${profile.id}@google.local`;

        const Model = getModel(role);

        // ---------------- FIND USER ----------------
        let user = await Model.findOne({ email });

        // ALSO check opposite model (prevent duplicate role mismatch)
        const otherModel = role === "shipper" ? Customer : Shipper;
        const conflictUser = await otherModel.findOne({ email });

        if (conflictUser) {
          return done(
            new Error("Email already registered with different role"),
            null
          );
        }

        // ================= LOGIN FLOW =================
        if (action === "login") {
          if (!user) {
            return done(
              new Error("No account found. Please sign up first."),
              null
            );
          }

          // FIXED: allow login even if providerId missing
          if (user.provider === "google" && user.providerId !== profile.id) {
            user.providerId = profile.id;
          }

          user.isLogin = true;

          await ensureStripeCustomer(user);
          await user.save();
        }

        // ================= SIGNUP FLOW =================
        else if (action === "signup") {
          if (user) {
            return done(
              new Error("Account already exists. Please login."),
              null
            );
          }

          const uniqueId = await generateUniqueId(role);

          user = new Model({
            uniqueId,
            name: profile.displayName,
            email,
            role,
            provider: "google",
            providerId: profile.id,
            emailVerified: true,
            isLogin: true,
            profilePicture: profile.photos?.[0]?.value || null,
          });

          await ensureStripeCustomer(user);
          await user.save();
        }

        // ================= LINK FLOW (optional future use) =================
        else if (action === "link") {
          if (!user) {
            return done(new Error("No account found to link"), null);
          }

          user.provider = "google";
          user.providerId = profile.id;

          await ensureStripeCustomer(user);
          await user.save();
        }

        // ================= TOKEN =================
        const token = generateToken({
          id: user._id,
          role: user.role,
        });

        const redirectUrl = `${process.env.FRONTEND_URL}/oauth-success?token=${token}`;

        return done(null, { redirectUrl });
      } catch (err) {
        console.error("OAuth Error:", err);
        return done(new Error(err.message || "Google OAuth failed"), null);
      }
    }
  )
);

passport.serializeUser((data, done) => done(null, data));
passport.deserializeUser((data, done) => done(null, data));
