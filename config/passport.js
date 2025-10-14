const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const generateToken = require("../utils/generateToken");

// ----------------- Helper Functions -----------------
const getModel = (role) => (role === "shipper" ? Shipper : Customer);

const generateUniqueId = async (role) => {
  const prefix = role === "shipper" ? "HS" : "HC";
  const Model = getModel(role);

  let id;
  let exists = true;

  while (exists) {
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit
    id = `${prefix}${randomNum}`;
    const existing = await Model.findOne({ uniqueId: id });
    if (!existing) exists = false;
  }
  return id;
};

// ----------------- Callback URL -----------------
const getCallbackURL = () => {
  const url =
    process.env.NODE_ENV === "production"
      ? process.env.GOOGLE_REDIRECT_URI_PROD
      : process.env.GOOGLE_REDIRECT_URI_LOCAL;

  console.log("Google OAuth Callback URL:", url);
  return url;
};

// ----------------- Google OAuth Strategy -----------------
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
        const role = req.session?.role || "shipper"; // default role
        const Model = getModel(role);

        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        if (!user) {
          console.log("Creating new user for Google login");

          const email =
            profile.emails?.[0]?.value || `${profile.id}@google.fake`;
          const name = profile.displayName || email.split("@")[0];

          // Generate uniqueId
          const uniqueId = await generateUniqueId(role);

          user = await Model.create({
            uniqueId, // Add uniqueId
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

          console.log("New user created:", user._id);
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
        console.error("Google OAuth Error:", err);
        done(err, null);
      }
    }
  )
);

// ----------------- Passport Serialize / Deserialize -----------------
passport.serializeUser((obj, done) => {
  console.log("serializeUser:", obj);
  done(null, obj);
});

passport.deserializeUser((obj, done) => {
  console.log("deserializeUser:", obj);
  done(null, obj);
});
