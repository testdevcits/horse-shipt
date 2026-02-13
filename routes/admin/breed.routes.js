const express = require("express");
const router = express.Router();

const breedController = require("../../controllers/admin/breed.controller");
const adminAuth = require("../../middleware/admin/adminAuth");

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
router.post("/", adminAuth, breedController.createBreed);

/**
 * @route   GET /api/admin/breeds
 * @desc    Get all breeds (can filter by active=true if needed)
 * @access  Public
 */
router.get("/", breedController.getBreeds);

/**
 * @route   DELETE /api/admin/breeds/:id
 * @desc    Soft delete breed (sets isActive = false)
 * @access  Admin only
 */
router.delete("/:id", adminAuth, breedController.deleteBreed);

/**
 * @route   PATCH /api/admin/breeds/:id/status
 * @desc    Activate / Deactivate breed
 * @access  Admin only
 * @body    { isActive: true/false }
 */
router.patch("/:id/status", adminAuth, breedController.updateBreedStatus);

module.exports = router;
