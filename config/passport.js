// passport/googleStrategy.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

// ---------------- Utility to get model based on role ----------------
const getModel = (role) => (role === "shipper" ? Shipper : Customer);

// ---------------- Callback URL based on environment ----------------
const getCallbackURL = () =>
  process.env.NODE_ENV === "production"
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI_LOCAL;

// ---------------- Google OAuth Strategy ----------------
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
        // ---------------- Parse state ----------------
        const state = req.query.state;
        if (!state) return done(new Error("Missing state parameter"), null);

        let parsedState;
        try {
          parsedState = JSON.parse(Buffer.from(state, "base64").toString());
        } catch (e) {
          return done(new Error("Invalid state parameter"), null);
        }

        const { role, location } = parsedState;
        if (!role || !["shipper", "customer"].includes(role)) {
          return done(new Error("Invalid role selected"), null);
        }

        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;

        // ---------------- Prevent cross-role duplicates ----------------
        const existingShipper = await Shipper.findOne({ email });
        const existingCustomer = await Customer.findOne({ email });
        if (
          (role === "shipper" && existingCustomer) ||
          (role === "customer" && existingShipper)
        ) {
          return done(
            new Error("Email already registered with another role"),
            null
          );
        }

        const Model = getModel(role);

        // ---------------- Find or create user ----------------
        let user = await Model.findOne({ email, providerId: profile.id });

        if (!user) {
          // Generate unique ID
          const uniqueId =
            role === "shipper"
              ? `HS${Math.floor(1000 + Math.random() * 9000)}`
              : `HC${Math.floor(1000 + Math.random() * 9000)}`;

          // Create new user
          user = new Model({
            uniqueId,
            name: profile.displayName || email.split("@")[0],
            email,
            provider: "google",
            providerId: profile.id,
            profilePicture: profile.photos?.[0]?.value || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            locale: profile._json?.locale || null,
            emailVerified: true,
            isLogin: true,
            role,
            rawProfile: profile._json || {},
            currentDevice: req.headers["user-agent"] || null,
            currentLocation: location || undefined,
            loginHistory: [
              {
                deviceId: req.headers["user-agent"] || null,
                ip: req.ip || null,
                loginAt: new Date(),
              },
            ],
          });

          await user.save();
        } else {
          // ---------------- Update login info ----------------
          user = await Model.findOneAndUpdate(
            { _id: user._id },
            {
              $set: {
                isLogin: true,
                currentDevice: req.headers["user-agent"] || user.currentDevice,
                currentLocation: location
                  ? { ...location, updatedAt: new Date() }
                  : user.currentLocation,
              },
              $push: {
                loginHistory: {
                  deviceId: req.headers["user-agent"] || null,
                  ip: req.ip || null,
                  loginAt: new Date(),
                },
              },
            },
            { new: true }
          );
        }

        // ---------------- Generate JWT ----------------
        const token = generateToken({ id: user._id, role: user.role });

        // Attach token to user object
        const userWithToken = user.toObject();
        userWithToken.token = token;

        done(null, userWithToken);
      } catch (err) {
        console.error("Google OAuth Error:", err);
        done(new Error(err.message || "Google OAuth failed"), null);
      }
    }
  )
);

// ---------------- Serialize/Deserialize ----------------
passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));

module.exports = passport;
