const Horse = require("../../models/customer/Horse");

/**
 * =====================================
 * CREATE / SAVE HORSE (STEP 3)
 * =====================================
 */
exports.createHorse = async (req, res) => {
  try {
    const customerId = req.user._id;

    console.log("----- Create Horse Request -----");
    console.log("User ID:", customerId);
    console.log("Request Body:", req.body);

    const {
      registeredName,
      barnName,
      breed,
      otherBreed,
      colour,
      age,
      sex,
      stallType,
      notes,
      generalInfo,
    } = req.body || {};

    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Request body missing",
      });
    }

    if (!registeredName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Registered name is required",
      });
    }

    if (!breed?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Breed is required",
      });
    }

    if (breed === "Other Breed" && !otherBreed?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Other breed is required",
      });
    }

    if (!sex) {
      return res.status(400).json({
        success: false,
        message: "Sex is required",
      });
    }

    // Check if horse with same registered name already exists for this user
    const existingHorse = await Horse.findOne({
      owner: customerId,
      registeredName: registeredName.trim(),
    });

    if (existingHorse) {
      return res.status(409).json({
        success: false,
        message: "Horse with this registered name already exists",
        horse: existingHorse,
      });
    }

    // Prepare horse data to save
    const horseData = {
      owner: customerId,
      registeredName: registeredName.trim(),
      barnName: barnName?.trim() || "",
      breed: breed.trim(),
      otherBreed: otherBreed?.trim() || "",
      colour: colour?.trim() || "",
      age: age?.trim() || "",
      sex,
      defaultStallSize: stallType || "Box",
      notes: notes?.trim() || generalInfo?.trim() || "",
    };

    // Save horse
    const horse = await Horse.create(horseData);

    console.log("Horse saved:", horse._id);

    return res.status(201).json({
      success: true,
      message: "Horse saved successfully",
      horse,
    });
  } catch (err) {
    console.error("Create Horse Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Unable to save horse",
    });
  }
};

/**
 * =====================================
 * GET MY SAVED HORSES
 * =====================================
 */
exports.getMyHorses = async (req, res) => {
  try {
    const horses = await Horse.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      horses,
    });
  } catch (err) {
    console.error("Get My Horses Error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch horses",
    });
  }
};

/**
 * =====================================
 * UPDATE HORSE
 * =====================================
 */
exports.updateHorse = async (req, res) => {
  try {
    const customerId = req.user._id;
    const horseId = req.params.horseId;

    if (!horseId) {
      return res
        .status(400)
        .json({ success: false, message: "Horse ID is required" });
    }

    const horse = await Horse.findOne({ _id: horseId, owner: customerId });
    if (!horse) {
      return res
        .status(404)
        .json({ success: false, message: "Horse not found" });
    }

    const {
      registeredName,
      barnName,
      breed,
      otherBreed,
      colour,
      age,
      sex,
      stallType,
      notes,
      generalInfo,
    } = req.body || {};

    // Validations
    if (registeredName && !registeredName.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Registered name cannot be empty" });
    }
    if (breed && !breed.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Breed cannot be empty" });
    }
    if (breed === "Other Breed" && (!otherBreed || !otherBreed.trim())) {
      return res
        .status(400)
        .json({ success: false, message: "Other breed is required" });
    }
    if (
      sex &&
      !["Stallion", "Gelding", "Mare", "Colt", "Filly"].includes(sex)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid sex value" });
    }

    // Check duplicate registered name
    if (registeredName && registeredName !== horse.registeredName) {
      const existingHorse = await Horse.findOne({
        owner: customerId,
        registeredName: registeredName.trim(),
        _id: { $ne: horseId },
      });
      if (existingHorse) {
        return res.status(409).json({
          success: false,
          message: "Another horse with this registered name already exists",
        });
      }
    }

    // Update fields
    horse.registeredName = registeredName?.trim() || horse.registeredName;
    horse.barnName = barnName?.trim() || horse.barnName;
    horse.breed = breed?.trim() || horse.breed;
    horse.otherBreed = otherBreed?.trim() || horse.otherBreed;
    horse.colour = colour?.trim() || horse.colour;
    horse.age = age?.trim() || horse.age;
    horse.sex = sex || horse.sex;
    horse.defaultStallSize = stallType || horse.defaultStallSize;
    horse.notes = notes?.trim() || generalInfo?.trim() || horse.notes;

    await horse.save();

    return res.status(200).json({
      success: true,
      message: "Horse updated successfully",
      horse,
    });
  } catch (err) {
    console.error("Update Horse Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Unable to update horse",
    });
  }
};

/**
 * =====================================
 * DELETE HORSE
 * =====================================
 */
exports.deleteHorse = async (req, res) => {
  try {
    const customerId = req.user._id;
    const horseId = req.params.horseId;

    if (!horseId) {
      return res
        .status(400)
        .json({ success: false, message: "Horse ID is required" });
    }

    const horse = await Horse.findOne({ _id: horseId, owner: customerId });
    if (!horse) {
      return res
        .status(404)
        .json({ success: false, message: "Horse not found" });
    }

    await horse.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Horse deleted successfully",
    });
  } catch (err) {
    console.error("Delete Horse Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Unable to delete horse",
    });
  }
};
