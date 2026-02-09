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

    const { registeredName, barnName, breed, colour, age, sex, generalInfo } =
      req.body;

    // ---------- Basic Validation ----------
    if (!registeredName || registeredName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Registered name is required",
        errors: {
          registeredName: "Registered name cannot be empty",
        },
      });
    }

    // ---------- File Map ----------
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    // ---------- Horse Payload ----------
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
    if (fileMap.photo) {
      horseData.photo = await uploadToCloudinary(fileMap.photo);
    }

    if (fileMap.cogins) {
      horseData.cogins = await uploadToCloudinary(fileMap.cogins);
    }

    if (fileMap.healthCertificate) {
      horseData.healthCertificate = await uploadToCloudinary(
        fileMap.healthCertificate
      );
    }

    // ---------- Save Horse ----------
    const horse = await Horse.create(horseData);

    return res.status(201).json({
      success: true,
      message: "Horse saved successfully",
      data: {
        horse,
      },
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
