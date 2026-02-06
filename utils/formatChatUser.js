module.exports = (user, role) => {
  // Avatar priority:
  // 1. Uploaded profile image (Cloudinary)
  // 2. Google OAuth profile picture
  // 3. Backend default image
  const resolvedAvatar =
    user.profileImage?.url || // <-- this handles your customer profileImage
    user.profilePicture ||
    "/assets/images/default_profile.png";

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    avatar: resolvedAvatar,
    isOnline: Boolean(user.isLogin),
    role, // "customer" | "shipper"
  };
};
