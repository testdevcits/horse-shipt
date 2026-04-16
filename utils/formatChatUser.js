const BASE_URL = process.env.BASE_URL || "https://horse-shipt.vercel.app";

module.exports = (user, role) => {
  // Avatar priority:
  // 1. Uploaded profile image (Cloudinary)
  // 2. Google OAuth profile picture
  // 3. Backend default image

  let avatarPath =
    user.profileImage?.url || // Cloudinary
    user.profilePicture || // Google
    "/assets/images/default_profile.png"; // default

  const resolvedAvatar = avatarPath.startsWith("http")
    ? avatarPath
    : `${BASE_URL}${avatarPath}`;

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    avatar: resolvedAvatar,
    isOnline: Boolean(user.isLogin),
    role,
  };
};
