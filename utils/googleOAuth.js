const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("./generateToken");

// Use a global object to temporarily store role from req.session
// (Set it in the route before calling passport.authenticate)
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
      passReqToCallback: true, // <-- allows access to req
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Get role from session set in the route
        const role = req.session?.role || "shipper";

        const Model = role === "shipper" ? Shipper : Customer;

        // Check if user exists
        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        if (!user) {
          const email = profile.emails[0]?.value || `${profile.id}@google.fake`;
          const name = profile.displayName || email.split("@")[0];

          user = await Model.create({
            name,
            email,
            provider: "google",
            providerId: profile.id,
            role, // explicitly set role
          });
        }

        const token = generateToken({ id: user._id, role: user.role });
        return done(null, { user, token });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
