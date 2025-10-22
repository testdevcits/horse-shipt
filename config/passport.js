const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

const getModel = (role) => (role === "shipper" ? Shipper : Customer);

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
        // --------------------------
        // Parse state safely
        // --------------------------
        const state = req.query.state;
        if (!state) return done(new Error("Missing state parameter"), null);

        let parsedState;
        try {
          parsedState = JSON.parse(Buffer.from(state, "base64").toString());
        } catch (e) {
          return done(new Error("Invalid state parameter"), null);
        }

        const role = parsedState.role;
        const location = parsedState.location;

        if (!role || !["shipper", "customer"].includes(role)) {
          return done(new Error("Invalid role selected"), null);
        }

        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;

        // Prevent duplicates across roles
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

        // Check if user exists
        let user = await Model.findOne({ email, providerId: profile.id });

        if (!user) {
          const uniqueId =
            role === "shipper"
              ? `HS${Math.floor(1000 + Math.random() * 9000)}`
              : `HC${Math.floor(1000 + Math.random() * 9000)}`;

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
          // Update login info
          user.isLogin = true;
          user.currentDevice = req.headers["user-agent"] || user.currentDevice;
          user.currentLocation = location
            ? { ...location, updatedAt: new Date() }
            : user.currentLocation;
          user.loginHistory.push({
            deviceId: req.headers["user-agent"] || null,
            ip: req.ip || null,
            loginAt: new Date(),
          });
          await user.save();
        }

        const token = generateToken({ id: user._id, role: user.role });

        // ------------------- FIXED: Include _id in redirect -------------------
        const redirectUrl = `${
          process.env.FRONTEND_URL
        }/oauth-success?token=${token}&role=${user.role}&_id=${
          user._id
        }&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(
          user.email
        )}&photo=${encodeURIComponent(
          user.profilePicture || ""
        )}&provider=google&providerId=${profile.id}`;

        done(null, { redirectUrl });
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
