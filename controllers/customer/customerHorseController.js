const Horse = require("../../models/customer/Horse");
const mongoose = require("mongoose");
const { uploadToCloudinary } = require("../../utils/cloudinary");

/**
 * =====================================
 * CREATE / SAVE HORSE (My Horses)
 * =====================================
 */
exports.createHorse = async (req, res) => {
  try {
    const customerId = req.user._id;

    // SUPPORT BOTH CASES
    const horseInput = req.body.horses?.[0] || req.body;

    console.log("Parsed horseInput:", horseInput);
    console.log("Files:", req.files);

    const { registeredName, barnName, breed, colour, age, sex, generalInfo } =
      horseInput;

    if (!registeredName || registeredName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Registered name is required",
      });
    }

    // ---------- File Map ----------
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    const horseData = {
      owner: customerId,
      registeredName: registeredName.trim(),
      barnName: barnName?.trim() || "",
      breed: breed?.trim() || "",
      colour: colour?.trim() || "",
      age: age || "",
      sex: sex || "",
      generalInfo: generalInfo?.trim() || "",
    };

    // ---------- Upload Files ----------
    if (fileMap["horses[0][photo]"] || fileMap.photo) {
      horseData.photo = await uploadToCloudinary(
        fileMap["horses[0][photo]"] || fileMap.photo
      );
    }

    const horse = await Horse.create(horseData);

    console.log("Horse saved:", horse._id);

    return res.status(201).json({
      success: true,
      message: "Horse saved successfully",
      data: { horse },
    });
  } catch (err) {
    console.error("Create Horse Error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to save horse. Please try again.",
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
    console.error("Get My Horses Error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch horses. Please try again.",
    });
  }
};
