const { apiResponse } = require("../../responses/api.response");
const Breed = require("../../models/admin/Breed");

const DEFAULT_BREEDS = [
  "American Sport Pony",
  "American Warmblood",
  "Appendix",
  "Argentinian Warmblood",
  "Belgian Warmblood",
  "Brandenburger",
  "Canadian Sport Horse",
  "Canadian Warmblood",
  "Chincoteague",
  "Cleveland Bay",
  "Connemara",
  "Crossbred",
  "Czech Warmblood",
  "Danish Warmblood",
  "Dutch Warmblood",
  "English TB",
  "French TB",
  "German Riding Pony",
  "German Warmblood",
  "Hanoverian",
  "Holsteiner",
  "Hungarian Warmblood",
  "Irish Draught",
  "Irish Sport Horse",
  "Irish TB",
  "New Forest Pony",
  "Oldenburg",
  "Paint",
  "Pony of the Americas",
  "Quarter Horse",
  "Quarter Pony",
  "RPSI",
  "Selle Francais",
  "Shetland",
  "Swedish Warmblood",
  "TB (Thoroughbred)",
  "TB Cross",
  "Trakehner",
  "Warmblood",
  "Warmblood Cross",
  "Welsh Cob",
  "Welsh Cross",
  "Welsh Pony",
  "Westphalian",
  "Zangersheide",
  "Other Breed",
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureDefaultBreeds = async () => {
  const activeCount = await Breed.countDocuments({ isActive: true });
  if (activeCount > 0) return;

  await Promise.all(
    DEFAULT_BREEDS.map((name) =>
      Breed.findOneAndUpdate(
        { name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } },
        {
          $set: {
            name,
            isActive: true,
            isOther: name === "Other Breed",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );
};

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

    const exists = await Breed.findOne({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
      isActive: true,
    });
    if (exists) {
      return res.status(400).json({ message: apiResponse.BREED_ALREADY_EXISTS });
    }

    const inactiveBreed = await Breed.findOne({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
      isActive: false,
    });

    if (inactiveBreed) {
      inactiveBreed.name = name;
      inactiveBreed.isActive = true;
      inactiveBreed.isOther = name.toLowerCase() === "other breed";
      await inactiveBreed.save();

      return res.status(201).json({
        message: apiResponse.BREED_CREATED_SUCCESSFULLY,
        data: inactiveBreed,
      });
    }

    const breed = await Breed.create({
      name,
      isOther: name.toLowerCase() === "other breed",
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
    await ensureDefaultBreeds();

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
    await ensureDefaultBreeds();

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
 *  UPDATE BREED
 * =====================================
 */
const updateBreed = async (req, res) => {
  try {
    let { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: apiResponse.BREED_NAME_IS_REQUIRED });
    }

    name = name.trim();

    const breed = await Breed.findById(req.params.id);
    if (!breed) {
      return res.status(404).json({ message: apiResponse.BREED_NOT_FOUND });
    }

    const duplicate = await Breed.findOne({
      _id: { $ne: breed._id },
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
      isActive: true,
    });

    if (duplicate) {
      return res.status(400).json({ message: apiResponse.BREED_ALREADY_EXISTS });
    }

    breed.name = name;
    breed.isOther = name.toLowerCase() === "other breed";
    await breed.save();

    return res.status(200).json({
      message: "Breed updated successfully",
      data: breed,
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
  updateBreed,
  deleteBreed,
  updateBreedStatus,
};
