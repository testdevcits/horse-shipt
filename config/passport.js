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
      console.log("=== Google OAuth Callback Triggered ===");
      console.log("Profile:", profile);

      try {
        // ---------------- Parse state safely ----------------
        const state = req.query.state;
        console.log("Raw state:", state);

        if (!state) {
          const redirectUrl = `${
            process.env.FRONTEND_URL
          }/oauth-success?error=${encodeURIComponent(
            "Missing state parameter"
          )}`;
          return done(null, { redirectUrl });
        }

        let parsedState;
        try {
          parsedState = JSON.parse(Buffer.from(state, "base64").toString());
          console.log("Parsed state:", parsedState);
        } catch (e) {
          const redirectUrl = `${
            process.env.FRONTEND_URL
          }/oauth-success?error=${encodeURIComponent(
            "Invalid state parameter"
          )}`;
          return done(null, { redirectUrl });
        }

        const { role, action } = parsedState;
        if (!role || !["shipper", "customer"].includes(role)) {
          const redirectUrl = `${
            process.env.FRONTEND_URL
          }/oauth-success?error=${encodeURIComponent("Invalid role")}`;
          return done(null, { redirectUrl });
        }
        if (!action || !["signup", "login"].includes(action)) {
          const redirectUrl = `${
            process.env.FRONTEND_URL
          }/oauth-success?error=${encodeURIComponent("Invalid action")}`;
          return done(null, { redirectUrl });
        }

        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;
        const Model = getModel(role);

        console.log(`Checking user existence for providerId: ${profile.id}`);
        let user = await Model.findOne({ providerId: profile.id });
        console.log("Found user:", user);

        // ---------------- SIGNUP ----------------
        if (action === "signup") {
          if (user) {
            const redirectUrl = `${
              process.env.FRONTEND_URL
            }/oauth-success?error=${encodeURIComponent(
              "Account already exists. Please login."
            )}`;
            return done(null, { redirectUrl });
          }

          const existingEmailUser = await Model.findOne({ email });
          if (existingEmailUser) {
            const redirectUrl = `${
              process.env.FRONTEND_URL
            }/oauth-success?error=${encodeURIComponent(
              "Email already registered. Please login."
            )}`;
            return done(null, { redirectUrl });
          }

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
          console.log("New user created:", user._id);
        }

        // ---------------- LOGIN ----------------
        else if (action === "login") {
          if (!user) {
            const redirectUrl = `${
              process.env.FRONTEND_URL
            }/oauth-success?error=${encodeURIComponent(
              "No account found. Please signup first."
            )}`;
            return done(null, { redirectUrl });
          }

          user.isLogin = true;
          user.currentDevice = req.headers["user-agent"] || user.currentDevice;
          user.loginHistory.push({
            deviceId: req.headers["user-agent"] || null,
            ip: req.ip || null,
            loginAt: new Date(),
          });
          await user.save();
          console.log("User login updated:", user._id);
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

        console.log("Redirect URL:", redirectUrl);
        done(null, { redirectUrl });
      } catch (err) {
        console.error("Google OAuth Error:", err);
        const redirectUrl = `${
          process.env.FRONTEND_URL
        }/oauth-success?error=${encodeURIComponent(
          err.message || "Google OAuth failed"
        )}`;
        done(null, { redirectUrl });
      }
    }
  )
);

// ---------------- Serialize/Deserialize ----------------
passport.serializeUser((obj, done) => {
  console.log("Serializing user:", obj);
  done(null, obj);
});

passport.deserializeUser((obj, done) => {
  console.log("Deserializing user:", obj);
  done(null, obj);
});
