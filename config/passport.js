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
        // ---------------- Parse state safely ----------------
        const state = req.query.state;
        if (!state)
          return done(null, false, { message: "Missing state parameter" });

        let parsedState;
        try {
          parsedState = JSON.parse(Buffer.from(state, "base64").toString());
        } catch (e) {
          return done(null, false, { message: "Invalid state parameter" });
        }

        const { role, action } = parsedState;
        if (!role || !["shipper", "customer"].includes(role))
          return done(null, false, { message: "Invalid role" });
        if (!action || !["signup", "login"].includes(action))
          return done(null, false, { message: "Invalid action" });

        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;
        const Model = getModel(role);

        // Check if user exists by providerId
        let user = await Model.findOne({ providerId: profile.id });

        // ---------------- SIGNUP ----------------
        if (action === "signup") {
          if (user) {
            return done(null, false, {
              message: "Account already exists. Please login.",
            });
          }

          // Prevent duplicate emails (manual signup)
          const existingEmailUser = await Model.findOne({ email });
          if (existingEmailUser) {
            return done(null, false, {
              message: "Email already registered. Please login.",
            });
          }

          // Create new user
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
            emailVerified: true,
            role,
            isLogin: true,
            loginHistory: [
              {
                deviceId: req.headers["user-agent"] || null,
                ip: req.ip || null,
                loginAt: new Date(),
              },
            ],
          });

          await user.save();
        }

        // ---------------- LOGIN ----------------
        else if (action === "login") {
          if (!user) {
            return done(null, false, {
              message: "No account found. Please signup first.",
            });
          }

          // Update login info
          user.isLogin = true;
          user.currentDevice = req.headers["user-agent"] || user.currentDevice;
          user.loginHistory.push({
            deviceId: req.headers["user-agent"] || null,
            ip: req.ip || null,
            loginAt: new Date(),
          });
          await user.save();
        }

        // ---------------- Generate token & redirect ----------------
        const token = generateToken({ id: user._id, role: user.role });
        const redirectUrl = `${
          process.env.FRONTEND_URL
        }/oauth-success?token=${token}&id=${user._id}&role=${
          user.role
        }&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(
          user.email
        )}&photo=${encodeURIComponent(
          user.profilePicture || ""
        )}&provider=google&providerId=${profile.id}`;

        done(null, { redirectUrl });
      } catch (err) {
        console.error("Google OAuth Error:", err);
        done(null, false, { message: err.message || "Google OAuth failed" });
      }
    }
  )
);

// ---------------- Serialize/Deserialize ----------------
passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
