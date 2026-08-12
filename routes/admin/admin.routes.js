const express = require("express");
const router = express.Router();

const adminController = require("../../controllers/admin/admin.controller");
const adminAuth = require("../../middleware/admin/adminAuth");

const superAdminOnly = (req, res, next) => {
  if (req.admin?.role !== "super-admin") {
    return res.status(403).json({
      success: false,
      message: "Only super admins can access this resource.",
    });
  }

  next();
};

// ================================
//  AUTH ROUTES
// ================================

// Signup (Internal use only)
router.post("/signup", adminController.signupAdmin);

// Login
router.post("/login", adminController.loginAdmin);

// Forgot password → Send OTP
router.post("/forgot-password", adminController.forgotPassword);

// Verify OTP (optional separate step for frontend validation)
router.post("/verify-otp", adminController.verifyOtp);

// Reset password using OTP
router.post("/reset-password", adminController.resetPasswordWithOtp);

// ================================
//  PROTECTED ROUTES (JWT)
// ================================

// Get admin profile
router.get("/profile", adminAuth, adminController.getAdminProfile);

// Update admin profile
router.put("/profile", adminAuth, adminController.updateAdminProfile);

// Change password (logged-in admin)
router.post("/change-password", adminAuth, adminController.changePassword);

// Admin user management (super-admin only)
router.get("/users", adminAuth, superAdminOnly, adminController.listAdmins);
router.post("/users", adminAuth, superAdminOnly, adminController.createAdminUser);
router.put("/users/:id", adminAuth, superAdminOnly, adminController.updateAdminUser);
router.patch(
  "/users/:id/status",
  adminAuth,
  superAdminOnly,
  adminController.toggleAdminStatus
);
router.delete(
  "/users/:id",
  adminAuth,
  superAdminOnly,
  adminController.deleteAdminUser
);

// Logout (JWT handled on frontend)
router.post("/logout", adminAuth, adminController.logoutAdmin);

module.exports = router;
