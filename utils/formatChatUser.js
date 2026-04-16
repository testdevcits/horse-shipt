const BASE_URL = process.env.BASE_URL || "https://horse-shipt.vercel.app";

module.exports = (user, role) => {
  let avatarPath = user.profileImage?.url || user.profilePicture || null;

  const resolvedAvatar =
    avatarPath && !avatarPath.startsWith("http")
      ? `${BASE_URL}${avatarPath}`
      : avatarPath;

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    avatar: resolvedAvatar, // can be null
    isOnline: Boolean(user.isLogin),
    role,
  };
};
