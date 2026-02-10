const Horse = require("../../models/customer/Horse");

/**
 * =====================================
 * CREATE / SAVE HORSE (My Horses)
 * =====================================
 */
exports.createHorse = async (req, res) => {
  try {
    const customerId = req.user._id;

    console.log("----- Create Horse Request -----");
    console.log("User ID:", customerId);
    console.log("Request Body:", req.body);
    console.log("Files:", req.files);

    /**
     * -------------------------------------
     * Handle multipart/form-data & JSON
     * -------------------------------------
     */
    const horseInput = {
      registeredName:
        req.body["horses[0][registeredName]"] || req.body.registeredName,
      barnName: req.body["horses[0][barnName]"] || req.body.barnName,
      breed: req.body["horses[0][breed]"] || req.body.breed,
      otherBreed: req.body["horses[0][otherBreed]"] || req.body.otherBreed,
      colour: req.body["horses[0][colour]"] || req.body.colour,
      age: req.body["horses[0][age]"] || req.body.age,
      sex: req.body["horses[0][sex]"] || req.body.sex,
      size: req.body["horses[0][size]"] || req.body.size,
      stallType:
        req.body["horses[0][stallType]"] || req.body.defaultStallSize || "Box",
      notes:
        req.body["horses[0][notes]"] ||
        req.body["horses[0][generalInfo]"] ||
        req.body.notes ||
        "",
    };

    /**
     * ================= VALIDATION =================
     */
    if (!horseInput.registeredName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Registered name is required",
      });
    }

    if (!horseInput.breed?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Breed is required",
      });
    }

    if (horseInput.breed === "Other Breed" && !horseInput.otherBreed?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Other breed is required",
      });
    }

    if (!horseInput.sex?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Sex is required",
      });
    }

    /**
     * ================= DUPLICATE CHECK =================
     */
    const existingHorse = await Horse.findOne({
      owner: customerId,
      registeredName: horseInput.registeredName.trim(),
    });

    if (existingHorse) {
      return res.status(409).json({
        success: false,
        message: "You have already saved a horse with this Registered Name",
        data: { horse: existingHorse },
      });
    }

    /**
     * ================= BUILD DATA =================
     */
    const horseData = {
      owner: customerId,
      registeredName: horseInput.registeredName.trim(),
      barnName: horseInput.barnName?.trim() || "",
      breed: horseInput.breed.trim(),
      otherBreed: horseInput.otherBreed?.trim() || "",
      colour: horseInput.colour?.trim() || "",
      age: horseInput.age ? Number(horseInput.age) : null,
      sex: horseInput.sex,
      size: horseInput.size || "",
      defaultStallSize: horseInput.stallType || "Box",
      notes: horseInput.notes?.trim() || "",
    };

    /**
     * ================= SAVE =================
     */
    const horse = await Horse.create(horseData);

    console.log("Horse successfully saved:", horse._id);

    return res.status(201).json({
      success: true,
      message: "Horse saved successfully",
      data: { horse },
    });
  } catch (err) {
    console.error("❌ Create Horse Error:", err);

    // Duplicate index error (Mongo)
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate horse name for this customer",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Unable to save horse. Please try again.",
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
    const horses = await Horse.find({
      owner: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Saved horses fetched successfully",
      data: {
        count: horses.length,
        horses,
      },
    });
  } catch (err) {
    console.error("❌ Get My Horses Error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch horses. Please try again.",
    });
  }
};
