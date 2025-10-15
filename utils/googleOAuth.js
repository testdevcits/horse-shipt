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
      callbackURL: getCallbackURL(), // env-based URL
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const role = req.session?.role || "shipper";

        // ---------- Determine main model ----------
        const Model = role === "shipper" ? Shipper : Customer;

        // ---------- Get email ----------
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

        // ---------- Check if OAuthUser exists ----------
        let oauthUser = await OAuthUser.findOne({
          providerId: profile.id,
          provider: "google",
        });

        if (!oauthUser) {
          // Create new minimal OAuthUser
          oauthUser = await OAuthUser.create({
            name: profile.displayName || email.split("@")[0],
            email,
            role,
            provider: "google",
            providerId: profile.id,
            profilePicture: profile.photos?.[0]?.value || null,
            isLogin: true,
          });
        } else {
          // Update login status
          oauthUser.isLogin = true;
          oauthUser.lastLoginAt = new Date();
          await oauthUser.save();
        }

        // ---------- Generate JWT ----------
        const token = generateToken({
          id: oauthUser._id,
          role: oauthUser.role,
        });

        // ---------- Redirect URL for frontend ----------
        const redirectUrl = `${
          process.env.FRONTEND_URL
        }/login?token=${token}&id=${oauthUser._id}&role=${
          oauthUser.role
        }&name=${encodeURIComponent(oauthUser.name)}&email=${encodeURIComponent(
          oauthUser.email
        )}&photo=${oauthUser.profilePicture || ""}&provider=google&providerId=${
          profile.id
        }`;

        done(null, { redirectUrl });
      } catch (err) {
        done(err, null);
      }
    }
  )
);
