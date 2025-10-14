const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("./generateToken");

const getModel = (role) => (role === "shipper" ? Shipper : Customer);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.NODE_ENV === "production"
          ? `${process.env.FRONTEND_URL}/auth/google/callback` // frontend callback URL
          : "http://localhost:3000/auth/google/callback", // local frontend callback
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const role = req.session?.role || "shipper"; // default role
        const Model = getModel(role);

        // Find existing user by providerId
        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        // If user doesn't exist, create new
        if (!user) {
          const email =
            profile.emails?.[0]?.value || `${profile.id}@google.fake`;
          const name = profile.displayName || email.split("@")[0];

          user = await Model.create({
            name,
            email,
            provider: "google",
            providerId: profile.id,
            role,
            profilePicture: profile.photos?.[0]?.value || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            locale: profile._json?.locale || null,
            emailVerified: profile.emails?.[0]?.verified || false,
            rawProfile: profile,
            isLogin: true,
            isActive: true,
            loginHistory: [],
          });
        }

        // Update profile picture if changed
        if (
          profile.photos?.[0]?.value &&
          profile.photos[0].value !== user.profilePicture
        ) {
          user.profilePicture = profile.photos[0].value;
        }

        user.isLogin = true;
        await user.save();

        // Generate JWT token
        const token = generateToken({ id: user._id, role: user.role });

        done(null, { ...user.toObject(), token });
      } catch (err) {
        console.error("Google OAuth Error:", err);
        done(err, null);
      }
    }
  )
);

// Serialize & deserialize user for sessions (optional)
passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
