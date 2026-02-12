const express = require("express");
const router = express.Router();

const adminController = require("../../controllers/admin/admin.controller");
const adminAuth = require("../../middleware/admin/adminAuth");

// ================================
//  AUTH ROUTES
// ================================

// (Optional / Internal use only)
router.post("/signup", adminController.signupAdmin);

// Login
router.post("/login", adminController.loginAdmin);

// Forgot password → Send OTP
router.post("/forgot-password", adminController.forgotPassword);

// Reset password using OTP
router.post("/reset-password", adminController.resetPasswordWithOtp);

// ================================
//  PROTECTED ROUTES (JWT)
// ================================

// Get admin profile
router.get("/profile", adminAuth, adminController.getAdminProfile);

// Change password (logged-in admin)
router.post("/change-password", adminAuth, adminController.changePassword);

// Logout (JWT handled on frontend)
router.post("/logout", adminAuth, adminController.logoutAdmin);

module.exports = router;
