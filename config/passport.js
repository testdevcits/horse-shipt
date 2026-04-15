const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const getModel = (role) => (role === "shipper" ? Shipper : Customer);

const getCallbackURL = () =>
  process.env.NODE_ENV === "production"
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI_LOCAL;

// ============================
// STRIPE HELPER
// ============================
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
        const state = req.query.state;
        if (!state) return done(new Error("Missing state parameter"), null);

        let parsedState;
        try {
          parsedState = JSON.parse(Buffer.from(state, "base64").toString());
        } catch {
          return done(new Error("Invalid state parameter"), null);
        }

        const role = parsedState.role;
        const action = parsedState.action || "login";

        if (!["shipper", "customer"].includes(role)) {
          return done(new Error("Invalid role selected"), null);
        }

        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;

        const existingShipper = await Shipper.findOne({ email });
        const existingCustomer = await Customer.findOne({ email });

        if (role === "shipper" && existingCustomer) {
          return done(
            new Error(
              "This email is registered as customer. Use correct role."
            ),
            null
          );
        }

        if (role === "customer" && existingShipper) {
          return done(
            new Error("This email is registered as shipper. Use correct role."),
            null
          );
        }

        const Model = getModel(role);

        let user = await Model.findOne({
          email,
          providerId: profile.id,
        });

        if (!user) {
          if (action === "login") {
            return done(
              new Error("No account found. Please sign up first."),
              null
            );
          }

          user = new Model({
            name: profile.displayName,
            email,
            provider: "google",
            providerId: profile.id,
            role,
            isLogin: true,
          });

          await ensureStripeCustomer(user);
          await user.save();
        } else {
          if (action === "signup") {
            return done(
              new Error("Account already exists. Please login."),
              null
            );
          }

          user.isLogin = true;

          if (!user.stripeCustomerId) {
            await ensureStripeCustomer(user);
          }

          await user.save();
        }

        const token = generateToken({ id: user._id, role: user.role });

        const redirectUrl = `${process.env.FRONTEND_URL}/oauth-success?token=${token}`;

        done(null, { redirectUrl });
      } catch (err) {
        done(new Error(err.message || "Google OAuth failed"), null);
      }
    }
  )
);

passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
