const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

const getModel = (role) => (role === "shipper" ? Shipper : Customer);

const getCallbackURL = () => {
  return process.env.NODE_ENV === "production"
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI_LOCAL;
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
        const role = req.session?.role || "shipper";
        const Model = getModel(role);

        // Check if user exists
        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        // Create new user if not exists
        if (!user) {
          const email =
            profile.emails?.[0]?.value || `${profile.id}@google.fake`;
          const name = profile.displayName || email.split("@")[0];

          // Generate uniqueId for user
          const prefix = role === "shipper" ? "HS" : "HC";
          let uniqueId;
          let exists = true;
          while (exists) {
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            uniqueId = `${prefix}${randomNum}`;
            const existing = await Model.findOne({ uniqueId });
            if (!existing) exists = false;
          }

          user = await Model.create({
            uniqueId,
            name,
            email,
            provider: "google",
            providerId: profile.id,
            role,
            profilePicture: profile.photos?.[0]?.value || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            locale: profile._json?.locale || null,
            emailVerified: true,
            rawProfile: profile,
            isLogin: true,
            isActive: true,
            loginHistory: [],
          });
        } else {
          user.isLogin = true;
          await user.save();
        }

        // Generate JWT token
        const token = generateToken({ id: user._id, role: user.role });

        // Attach full user info + token to req.user
        done(null, {
          _id: user._id,
          uniqueId: user.uniqueId,
          name: user.name,
          email: user.email,
          role: user.role,
          provider: user.provider,
          providerId: user.providerId,
          profilePicture: user.profilePicture,
          token,
        });
      } catch (err) {
        console.error("❌ Google OAuth Error:", err);
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
