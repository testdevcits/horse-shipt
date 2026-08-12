const express = require("express");
const router = express.Router();

const breedController = require("../../controllers/admin/breed.controller");
const adminAuth = require("../../middleware/admin/adminAuth");
const { requireAdminPermission } = require("../../middleware/admin/permissionMiddleware");
const canManageHorseAttributes = requireAdminPermission("horse_attributes:manage");

/**
 * =====================================
 *  BREED ROUTES
 * =====================================
 */

/**
 * @route   POST /api/admin/breeds
 * @desc    Create a new breed
 * @access  Admin only
 */
router.post("/", adminAuth, canManageHorseAttributes, breedController.createBreed);

/**
 * @route   GET /api/admin/breeds
 * @desc    Get all breeds (paginated for admin, auth required)
 * @access  Admin only
 * @query   page, limit, showInactive
 */
router.get("/", adminAuth, canManageHorseAttributes, breedController.getBreeds);

/**
 * @route   GET /api/admin/breeds/all
 * @desc    Get all active breeds (for dropdowns)
 * @access  Public
 */
router.get("/all", breedController.getAllBreeds);

/**
 * @route   PUT /api/admin/breeds/:id
 * @desc    Update breed name
 * @access  Admin only
 */
router.put("/:id", adminAuth, canManageHorseAttributes, breedController.updateBreed);

/**
 * @route   DELETE /api/admin/breeds/:id
 * @desc    Soft delete breed (sets isActive = false)
 * @access  Admin only
 */
router.delete("/:id", adminAuth, canManageHorseAttributes, breedController.deleteBreed);

/**
 * @route   PATCH /api/admin/breeds/:id/status
 * @desc    Activate / Deactivate breed
 * @access  Admin only
 * @body    { isActive: true/false }
 */
router.patch("/:id/status", adminAuth, canManageHorseAttributes, breedController.updateBreedStatus);

module.exports = router;
