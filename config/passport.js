const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Shipper = require("../models/shipper/shipperModel");
const Customer = require("../models/customer/customerModel");
const OAuthUser = require("../models/OAuthUser"); // New minimal OAuth model
const generateToken = require("../utils/generateToken");

// ---------------- Helper functions ----------------
const getModel = (role) => (role === "shipper" ? Shipper : Customer);
const getCallbackURL = () =>
  process.env.NODE_ENV === "production"
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI_LOCAL;

// ---------------- Google OAuth Strategy ----------------
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

        const email = profile.emails?.[0]?.value || `${profile.id}@google.fake`;

        // ---------- Prevent duplicate across roles ----------
        const existingShipper = await Shipper.findOne({ email });
        const existingCustomer = await Customer.findOne({ email });

        if (
          (role === "shipper" && existingCustomer) ||
          (role === "customer" && existingShipper)
        ) {
          return done(
            new Error(
              "This email is already registered with another role. Please login with that account."
            ),
            null
          );
        }

        // ---------- Check if OAuth user already exists ----------
        let user = await OAuthUser.findOne({
          email,
          provider: "google",
          providerId: profile.id,
        });

        if (!user) {
          // Create minimal OAuth user
          user = await OAuthUser.create({
            name: profile.displayName || email.split("@")[0],
            email,
            provider: "google",
            providerId: profile.id,
            role,
            profilePicture: profile.photos?.[0]?.value || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            locale: profile._json?.locale || null,
            emailVerified: true,
            isLogin: true,
            rawProfile: profile,
          });
        } else {
          // Update login status
          user.isLogin = true;
          user.lastLoginAt = new Date();
          await user.save();
        }

        // Generate JWT token
        const token = generateToken({ id: user._id, role: user.role });

        // Redirect URL to frontend
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
        done(err, null);
      }
    }
  )
);

// ---------------- Serialize / Deserialize ----------------
passport.serializeUser((obj, done) => done(null, obj));
passport.deserializeUser((obj, done) => done(null, obj));
