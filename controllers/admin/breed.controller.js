const Breed = require("../../models/admin/Breed");

/**
 * =====================================
 *  CREATE BREED
 * =====================================
 */
const createBreed = async (req, res) => {
  try {
    let { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Breed name is required" });
    }

    name = name.trim();

    const exists = await Breed.findOne({ name, isActive: true });
    if (exists) {
      return res.status(400).json({ message: "Breed already exists" });
    }

    const breed = await Breed.create({
      name,
      isOther: name.toLowerCase() === "other",
    });

    return res.status(201).json({
      message: "Breed created successfully",
      data: breed,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * =====================================
 *  GET BREEDS (with pagination)
 * =====================================
 */
const getBreeds = async (req, res) => {
  try {
    let { page = 1, limit = 10, showInactive = false } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    // Filter active breeds by default
    const filter = showInactive === "true" ? {} : { isActive: true };

    const total = await Breed.countDocuments(filter);

    const breeds = await Breed.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      count: breeds.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: breeds,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * =====================================
 *  GET ALL BREEDS (FULL, for dropdowns)
 * =====================================
 */
const getAllBreeds = async (req, res) => {
  try {
    // Default sirf active breeds
    const breeds = await Breed.find({ isActive: true }).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: breeds.length,
      data: breeds,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * =====================================
 *  SOFT DELETE BREED
 * =====================================
 */
const deleteBreed = async (req, res) => {
  try {
    const breed = await Breed.findById(req.params.id);

    if (!breed) {
      return res.status(404).json({ message: "Breed not found" });
    }

    breed.isActive = false;
    await breed.save();

    return res.status(200).json({
      message: "Breed deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * =====================================
 *  ACTIVATE / DEACTIVATE BREED
 * =====================================
 */
const updateBreedStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be true or false",
      });
    }

    const breed = await Breed.findById(req.params.id);

    if (!breed) {
      return res.status(404).json({ message: "Breed not found" });
    }

    breed.isActive = isActive;
    await breed.save();

    return res.status(200).json({
      message: `Breed ${isActive ? "activated" : "deactivated"} successfully`,
      data: breed,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createBreed,
  getBreeds,
  getAllBreeds,
  deleteBreed,
  updateBreedStatus,
};
