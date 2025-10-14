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
      callbackURL: getCallbackURL(), // use env-based URL
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const role = req.session?.role || "shipper";
        const Model = role === "shipper" ? Shipper : Customer;

        let user = await Model.findOne({
          providerId: profile.id,
          provider: "google",
        });

        if (!user) {
          user = await Model.create({
            name: profile.displayName || profile.emails[0].value.split("@")[0],
            email: profile.emails?.[0]?.value || `${profile.id}@google.fake`,
            provider: "google",
            providerId: profile.id,
            role,
            profilePicture: profile.photos?.[0]?.value || null,
            emailVerified: true,
            isLogin: true,
            isActive: true,
          });
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

        done(null, { redirectUrl });
      } catch (err) {
        done(err, null);
      }
    }
  )
);
