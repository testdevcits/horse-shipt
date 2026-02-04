module.exports = (user, role) => {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    avatar:
      user.profilePicture ||
      user.profileImage?.url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`,
    isOnline: user.isLogin || false,
    role, // "customer" | "shipper"
  };
};
