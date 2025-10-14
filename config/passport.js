const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

const getModel = (role) => (role === "shipper" ? Shipper : Customer);

// Use correct callback URL based on environment
const getCallbackURL = () => {
  const url =
    process.env.NODE_ENV === "production"
      ? process.env.GOOGLE_REDIRECT_URI_PROD
      : process.env.GOOGLE_REDIRECT_URI_LOCAL;
  console.log("✅ Google OAuth Callback URL:", url);
  return url;
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
        console.log("🌐 Google OAuth Profile:", profile);

        const role = req.session?.role || "shipper"; // default role
        console.log("🔹 Role from session:", role);

        const Model = getModel(role);

        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        if (!user) {
          console.log("🆕 Creating new user for Google login");

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
            emailVerified: true,
            rawProfile: profile,
            isLogin: true,
            isActive: true,
            loginHistory: [],
          });

          console.log("✅ New user created:", user._id);
        } else {
          console.log("🔹 Existing user found:", user._id);
        }

        user.isLogin = true;
        await user.save();

        const token = generateToken({ id: user._id, role: user.role });

        const redirectUrl = `${
          process.env.FRONTEND_URL
        }/login?token=${token}&id=${user._id}&role=${
          user.role
        }&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(
          user.email
        )}&photo=${user.profilePicture || ""}&provider=google&providerId=${
          profile.id
        }`;

        console.log("➡️ Redirecting to frontend:", redirectUrl);

        done(null, { redirectUrl });
      } catch (err) {
        console.error("❌ Google OAuth Error:", err);
        done(err, null);
      }
    }
  )
);

passport.serializeUser((obj, done) => {
  console.log("📦 serializeUser:", obj);
  done(null, obj);
});

passport.deserializeUser((obj, done) => {
  console.log("📤 deserializeUser:", obj);
  done(null, obj);
});
