const { apiResponse } = require("../../responses/api.response");
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
      return res.status(400).json({ message: apiResponse.BREED_NAME_IS_REQUIRED });
    }

    name = name.trim();

    const exists = await Breed.findOne({ name, isActive: true });
    if (exists) {
      return res.status(400).json({ message: apiResponse.BREED_ALREADY_EXISTS });
    }

    const breed = await Breed.create({
      name,
      isOther: name.toLowerCase() === "other",
    });

    return res.status(201).json({
      message: apiResponse.BREED_CREATED_SUCCESSFULLY,
      data: breed,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: apiResponse.SERVER_ERROR });
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

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      count: breeds.length,
      total,
      page,
      limit,
      totalPages,
      pagination: {
        page,
        limit,
        total,
        totalRecords: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      data: breeds,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: apiResponse.SERVER_ERROR });
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
    return res.status(500).json({ message: apiResponse.SERVER_ERROR });
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
      return res.status(404).json({ message: apiResponse.BREED_NOT_FOUND });
    }

    breed.isActive = false;
    await breed.save();

    return res.status(200).json({
      message: apiResponse.BREED_DELETED_SUCCESSFULLY,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: apiResponse.SERVER_ERROR });
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
        message: apiResponse.ISACTIVE_MUST_BE_TRUE_OR_FALSE,
      });
    }

    const breed = await Breed.findById(req.params.id);

    if (!breed) {
      return res.status(404).json({ message: apiResponse.BREED_NOT_FOUND });
    }

    breed.isActive = isActive;
    await breed.save();

    return res.status(200).json({
      message: `Breed ${isActive ? "activated" : "deactivated"} successfully`,
      data: breed,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: apiResponse.SERVER_ERROR });
  }
};

module.exports = {
  createBreed,
  getBreeds,
  getAllBreeds,
  deleteBreed,
  updateBreedStatus,
};
