// config/passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

// ----------------- Utility -----------------
const getModel = (role) => (role === "shipper" ? Shipper : Customer);

const generateUniqueId = async (role) => {
  const prefix = role === "shipper" ? "HS" : "HC";
  const Model = getModel(role);

  let id;
  let exists = true;

  while (exists) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    id = `${prefix}${randomNum}`;
    const existing = await Model.findOne({ uniqueId: id });
    if (!existing) exists = false;
  }
  return id;
};

// ----------------- Google Strategy -----------------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const role = req.session?.role || "shipper";
        const Model = getModel(role);

        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        // If user doesn't exist, create new user with unique ID
        if (!user) {
          const uniqueId = await generateUniqueId(role); // <--- generate unique ID
          const email =
            profile.emails?.[0]?.value || `${profile.id}@google.fake`;
          const name = profile.displayName || email.split("@")[0];

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

        const token = generateToken({ id: user._id, role: user.role });

        // Redirect URL for frontend
        const redirectUrl = `${
          process.env.FRONTEND_URL
        }/auth/google/callback?token=${token}&id=${user._id}&role=${
          user.role
        }&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(
          user.email
        )}&photo=${user.profilePicture || ""}&provider=google&providerId=${
          profile.id
        }`;

        done(null, { redirectUrl });
      } catch (err) {
        console.error("Google OAuth Error:", err);
        done(err, null);
      }
    }
  )
);

passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
