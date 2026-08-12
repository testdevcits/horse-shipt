const legacyPermissionGrants = {
  "shippers:view": ["shippers:list"],
  "customers:view": ["customers:list"],
  "shipments:view": ["shipments:list"],
  "horse_attributes:manage": [
    "horse_attributes:breeds",
    "horse_attributes:colors",
    "horse_attributes:sexes",
  ],
  "newsletter:manage": ["newsletter:subscribers"],
  "notifications:view": ["notifications:list"],
  "platform:manage": [
    "platform:settings",
    "platform:stripe_payments",
    "platform:subscriptions",
  ],
  "legal:manage": ["legal:privacy_policy", "legal:terms_conditions"],
  "account:manage": ["account:profile", "account:settings"],
};

const hasAdminPermission = (admin, permission) => {
  if (!admin) return false;
  if (admin.role === "super-admin") return true;
  const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];

  return permissions.some(
    (assignedPermission) =>
      assignedPermission === permission ||
      legacyPermissionGrants[assignedPermission]?.includes(permission)
  );
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
