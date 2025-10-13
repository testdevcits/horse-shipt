const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("./generateToken");

// Passport Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
      passReqToCallback: true, // allows access to req
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Get role from session or default to 'shipper'
        const role = req.session?.role || "shipper";

        // Select model based on role
        const Model = role === "shipper" ? Shipper : Customer;

        // Check if user already exists
        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        if (!user) {
          const email =
            profile.emails?.[0]?.value || `${profile.id}@google.fake`;
          const name = profile.displayName || email.split("@")[0];

          user = await Model.create({
            name,
            email,
            provider: "google",
            providerId: profile.id,
            role, // explicitly set role
          });
        }

        // Generate JWT token
        const token = generateToken({ id: user._id, role: user.role });

        // Pass full user info and token to frontend via query params
        const userInfo = {
          _id: user._id,
          role: user.role,
          name: user.name,
          email: user.email,
          photo: user.profilePicture || "",
          provider: user.provider,
          providerId: user.providerId,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          locale: user.locale || "",
          isLogin: user.isLogin,
          isActive: user.isActive,
          token,
        };

        return done(null, userInfo);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// Serialize and deserialize user for session support
passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
