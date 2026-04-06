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

        if (!state) {
          return done(null, {
            redirectUrl: `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent("Missing state parameter")}`,
          });
        }

        let parsedState;
        try {
          parsedState = JSON.parse(Buffer.from(state, "base64").toString());
        } catch (e) {
          return done(null, {
            redirectUrl: `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent("Invalid state parameter")}`,
          });
        }

        const role = parsedState.role;
        const location = parsedState.location;

        if (!role || !["shipper", "customer"].includes(role)) {
          return done(null, {
            redirectUrl: `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent("Invalid role selected")}`,
          });
        }

        // --------------------------
        // Extract email
        // --------------------------
        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;

        // --------------------------
        // Prevent cross-role login
        // --------------------------
        const existingShipper = await Shipper.findOne({ email });
        const existingCustomer = await Customer.findOne({ email });

        if (
          (role === "shipper" && existingCustomer) ||
          (role === "customer" && existingShipper)
        ) {
          return done(null, {
            redirectUrl: `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent(
              "Email already registered with another role"
            )}`,
          });
        }

        const Model = getModel(role);

        // --------------------------
        // LOGIN ONLY (NO SIGNUP)
        // --------------------------
        let user = await Model.findOne({ email });

        // If user not found → reject
        if (!user) {
          return done(null, {
            redirectUrl: `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent(
              "Account not found. Please sign up first."
            )}`,
          });
        }

        // --------------------------
        // ⚠️ Role mismatch protection
        // --------------------------
        if (user.role !== role) {
          return done(null, {
            redirectUrl: `${
              process.env.FRONTEND_URL
            }/login?error=${encodeURIComponent(
              "Please login with correct role"
            )}`,
          });
        }

        // --------------------------
        // Update login info
        // --------------------------
        user.provider = "google";
        user.providerId = profile.id;
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

        // --------------------------
        // Generate token
        // --------------------------
        const token = generateToken({
          id: user._id,
          role: user.role,
        });

        // --------------------------
        // Redirect URL
        // --------------------------
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
          redirectUrl: `${
            process.env.FRONTEND_URL
          }/login?error=${encodeURIComponent(
            err.message || "Google OAuth failed"
          )}`,
        });
      }
    }
  )
);

// ---------------- Serialize/Deserialize ----------------
passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
