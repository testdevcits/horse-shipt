const hasAdminPermission = (admin, permission) => {
  if (!admin) return false;
  if (admin.role === "super-admin") return true;
  return Array.isArray(admin.permissions) && admin.permissions.includes(permission);
};

const requireAdminPermission = (permission) => (req, res, next) => {
  if (hasAdminPermission(req.admin, permission)) return next();

  return res.status(403).json({
    success: false,
    message: "You do not have permission to access this admin module.",
  });
};

module.exports = {
  hasAdminPermission,
  requireAdminPermission,
};
