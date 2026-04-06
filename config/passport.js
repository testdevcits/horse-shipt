const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

const getModel = (role) => (role === "shipper" ? Shipper : Customer);

// Helper: Safe redirect builder
const buildRedirect = (path, message) =>
  `${process.env.FRONTEND_URL}${path}?error=${encodeURIComponent(message)}`;

const getCallbackURL = () =>
  process.env.NODE_ENV === "production"
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI_LOCAL;

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
        /* ===============================
           PARSE STATE (SAFE)
        ================================ */
        const state = req.query.state;

        if (!state) {
          return done(null, {
            redirectUrl: buildRedirect(
              "/login",
              "Something went wrong. Please try again."
            ),
          });
        }

        let parsedState;
        try {
          parsedState = JSON.parse(Buffer.from(state, "base64").toString());
        } catch (err) {
          return done(null, {
            redirectUrl: buildRedirect(
              "/login",
              "Invalid authentication request"
            ),
          });
        }

        const { role, location } = parsedState;

        if (!role || !["shipper", "customer"].includes(role)) {
          return done(null, {
            redirectUrl: buildRedirect("/login", "Invalid role selected"),
          });
        }

        /* ===============================
           EXTRACT EMAIL
        ================================ */
        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;

        if (!email) {
          return done(null, {
            redirectUrl: buildRedirect(
              "/login",
              "Unable to fetch email from Google"
            ),
          });
        }

        /* ===============================
           PREVENT CROSS ROLE LOGIN
        ================================ */
        const [existingShipper, existingCustomer] = await Promise.all([
          Shipper.findOne({ email }),
          Customer.findOne({ email }),
        ]);

        if (
          (role === "shipper" && existingCustomer) ||
          (role === "customer" && existingShipper)
        ) {
          return done(null, {
            redirectUrl: buildRedirect(
              "/login",
              "Email already registered with another role"
            ),
          });
        }

        const Model = getModel(role);

        /* ===============================
           LOGIN ONLY (NO AUTO SIGNUP)
        ================================ */
        let user = await Model.findOne({ email });

        if (!user) {
          return done(null, {
            redirectUrl: buildRedirect(
              "/login",
              "Account not found. Please sign up first."
            ),
          });
        }

        /* ===============================
           ROLE VALIDATION
        ================================ */
        if (user.role !== role) {
          return done(null, {
            redirectUrl: buildRedirect(
              "/login",
              "Please login with correct role"
            ),
          });
        }

        /* ===============================
           UPDATE USER LOGIN INFO
        ================================ */
        user.provider = "google";
        user.providerId = profile.id;
        user.isLogin = true;

        user.currentDevice = req.headers["user-agent"] || user.currentDevice;

        if (location) {
          user.currentLocation = {
            ...location,
            updatedAt: new Date(),
          };
        }

        user.loginHistory = user.loginHistory || [];
        user.loginHistory.push({
          deviceId: req.headers["user-agent"] || null,
          ip: req.ip || null,
          loginAt: new Date(),
        });

        await user.save();

        /* ===============================
           GENERATE TOKEN
        ================================ */
        const token = generateToken({
          id: user._id,
          role: user.role,
        });

        /* ===============================
           SUCCESS REDIRECT
        ================================ */
        const redirectUrl = `${
          process.env.FRONTEND_URL
        }/oauth-success?token=${token}&id=${user._id}&role=${
          user.role
        }&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(
          user.email
        )}&photo=${encodeURIComponent(
          user.profilePicture || ""
        )}&provider=google&providerId=${profile.id}`;

        return done(null, { redirectUrl });
      } catch (err) {
        console.error("Google OAuth Error:", err);

        return done(null, {
          redirectUrl: buildRedirect(
            "/login",
            err.message || "Google login failed"
          ),
        });
      }
    }
  )
);

/* ===============================
   SERIALIZE / DESERIALIZE
================================ */
passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
