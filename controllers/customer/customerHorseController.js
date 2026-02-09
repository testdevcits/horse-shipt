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

    // Support both single object and array from frontend
    const horseInput = req.body.horses?.[0] || req.body;

    console.log("----- Create Horse Request -----");
    console.log("User ID:", customerId);
    console.log("Horse Input:", horseInput);
    console.log("Files Received:", req.files);

    const {
      registeredName,
      barnName,
      breed,
      otherBreed,
      colour,
      age,
      sex,
      size,
      defaultStallSize,
      notes,
      generalInfo,
    } = horseInput;

    // Validation
    if (!registeredName || registeredName.trim() === "") {
      console.warn("Validation failed: Registered Name missing");
      return res.status(400).json({
        success: false,
        message: "Registered name is required",
      });
    }

    if (!breed || breed.trim() === "") {
      console.warn("Validation failed: Breed missing");
      return res.status(400).json({
        success: false,
        message: "Breed is required",
      });
    }

    if (breed === "Other Breed" && (!otherBreed || otherBreed.trim() === "")) {
      console.warn("Validation failed: Other Breed missing");
      return res.status(400).json({
        success: false,
        message: "Other breed is required",
      });
    }

    if (!sex || sex.trim() === "") {
      console.warn("Validation failed: Sex missing");
      return res.status(400).json({
        success: false,
        message: "Sex is required",
      });
    }

    // Map uploaded files
    const fileMap = {};
    (req.files || []).forEach((file) => {
      fileMap[file.fieldname] = file;
    });

    // Build horse data object
    const horseData = {
      owner: customerId,
      registeredName: registeredName.trim(),
      barnName: barnName?.trim() || "",
      breed: breed?.trim(),
      otherBreed: otherBreed?.trim() || "",
      colour: colour?.trim() || "",
      age: age || "",
      sex,
      size: size || "",
      defaultStallSize: defaultStallSize || "Box",
      notes: notes?.trim() || generalInfo?.trim() || "",
    };

    // Upload photo if provided
    if (fileMap["horses[0][photo]"] || fileMap.photo) {
      console.log("Uploading photo to Cloudinary...");
      horseData.photo = await uploadToCloudinary(
        fileMap["horses[0][photo]"] || fileMap.photo
      );
      console.log("Photo uploaded:", horseData.photo);
    }

    // Save to database
    const horse = await Horse.create(horseData);

    console.log("Horse successfully saved:", horse._id);

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

    console.log(`Fetched ${horses.length} horses for user ${req.user._id}`);

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
