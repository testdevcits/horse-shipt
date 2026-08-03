const { apiResponse } = require("../../responses/api.response");
const Horse = require("../../models/customer/Horse");
const cloudinary = require("../../utils/cloudinary");
const sharp = require("sharp");
const fs = require("fs");

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const getFileByField = (files = [], fieldName) =>
  files.find((file) => file.fieldname === fieldName);

const getFileBuffer = (file) => {
  if (!file) return null;
  if (file.buffer) return file.buffer;
  if (file.path) return fs.readFileSync(file.path);
  return null;
};

const assertFileSize = (file) => {
  if (file && Number(file.size || 0) > MAX_FILE_SIZE) {
    throw new Error(`${file.originalname || file.fieldname} too large (Max 10MB)`);
  }
};

const optimizeHorseImage = async (file) => {
  const buffer = getFileBuffer(file);
  if (!buffer) return null;

  return sharp(buffer)
    .resize({
      width: 1024,
      height: 768,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75 })
    .toBuffer();
};

const uploadHorsePhoto = async (file) => {
  if (!file) return null;
  assertFileSize(file);

  const buffer = await optimizeHorseImage(file);
  if (!buffer) return null;

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "horses/profiles/photos",
        resource_type: "image",
      },
      (error, uploadResult) => {
        if (error) reject(error);
        else resolve(uploadResult);
      }
    );

    uploadStream.end(buffer);
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
    width: result.width || null,
    height: result.height || null,
    bytes: result.bytes || null,
    format: result.format || null,
  };
};

const uploadHorseDocument = async (file) => {
  if (!file) return null;
  assertFileSize(file);

  if (file.mimetype !== "application/pdf") {
    throw new Error("Horse documents must be PDFs");
  }

  const result = await cloudinary.uploader.upload(file.path, {
    folder: "horses/profiles/documents",
    resource_type: "raw",
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
    originalName: file.originalname || null,
  };
};

const deleteCloudinaryAsset = async (asset, resourceType = "image") => {
  if (!asset?.public_id) return;

  try {
    await cloudinary.uploader.destroy(asset.public_id, {
      resource_type: resourceType,
    });
  } catch (error) {
    console.error("[HORSE ASSET DELETE ERROR]", error.message);
  }
};

const buildHorseMedia = async (files = [], existingHorse = null) => {
  const media = {};
  const photoFile = getFileByField(files, "photo");
  const cogginsFile = getFileByField(files, "coggins");
  const healthCertificateFile = getFileByField(files, "healthCertificate");

  if (photoFile) {
    const photo = await uploadHorsePhoto(photoFile);
    if (photo) {
      await deleteCloudinaryAsset(existingHorse?.photo, "image");
      media.photo = photo;
    }
  }

  if (cogginsFile || healthCertificateFile) {
    media.documents = { ...(existingHorse?.documents?.toObject?.() || existingHorse?.documents || {}) };
  }

  if (cogginsFile) {
    const coggins = await uploadHorseDocument(cogginsFile);
    await deleteCloudinaryAsset(existingHorse?.documents?.coggins, "raw");
    media.documents.coggins = coggins;
  }

  if (healthCertificateFile) {
    const healthCertificate = await uploadHorseDocument(healthCertificateFile);
    await deleteCloudinaryAsset(existingHorse?.documents?.healthCertificate, "raw");
    media.documents.healthCertificate = healthCertificate;
  }

  return media;
};

/**
 * =====================================
 * CREATE / SAVE HORSE (STEP 3)
 * =====================================
 */
exports.createHorse = async (req, res) => {
  try {
    const customerId = req.user._id;

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
        message: apiResponse.REQUEST_BODY_MISSING,
      });
    }

    if (!registeredName?.trim()) {
      return res.status(400).json({
        success: false,
        message: apiResponse.REGISTERED_NAME_IS_REQUIRED,
      });
    }

    if (!breed?.trim()) {
      return res.status(400).json({
        success: false,
        message: apiResponse.BREED_IS_REQUIRED,
      });
    }

    if (breed === "Other Breed" && !otherBreed?.trim()) {
      return res.status(400).json({
        success: false,
        message: apiResponse.OTHER_BREED_IS_REQUIRED,
      });
    }

    if (!sex) {
      return res.status(400).json({
        success: false,
        message: apiResponse.SEX_IS_REQUIRED,
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
        message: apiResponse.HORSE_WITH_THIS_REGISTERED_NAME_ALREADY_EXISTS,
        horse: existingHorse,
      });
    }

    const media = await buildHorseMedia(req.files || []);

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
      ...media,
    };

    // Save horse
    const horse = await Horse.create(horseData);

    return res.status(201).json({
      success: true,
      message: apiResponse.HORSE_SAVED_SUCCESSFULLY,
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
      message: apiResponse.UNABLE_TO_FETCH_HORSES,
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
        .json({ success: false, message: apiResponse.HORSE_ID_IS_REQUIRED });
    }

    const horse = await Horse.findOne({ _id: horseId, owner: customerId });
    if (!horse) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.HORSE_NOT_FOUND });
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
        .json({ success: false, message: apiResponse.REGISTERED_NAME_CANNOT_BE_EMPTY });
    }
    if (breed && !breed.trim()) {
      return res
        .status(400)
        .json({ success: false, message: apiResponse.BREED_CANNOT_BE_EMPTY });
    }
    if (breed === "Other Breed" && (!otherBreed || !otherBreed.trim())) {
      return res
        .status(400)
        .json({ success: false, message: apiResponse.OTHER_BREED_IS_REQUIRED });
    }
    if (
      sex &&
      !["Stallion", "Gelding", "Mare", "Colt", "Filly"].includes(sex)
    ) {
      return res
        .status(400)
        .json({ success: false, message: apiResponse.INVALID_SEX_VALUE });
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
          message: apiResponse.ANOTHER_HORSE_WITH_THIS_REGISTERED_NAME_ALREADY_EXISTS,
        });
      }
    }

    const media = await buildHorseMedia(req.files || [], horse);

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
    if (media.photo) horse.photo = media.photo;
    if (media.documents) horse.documents = media.documents;

    await horse.save();

    return res.status(200).json({
      success: true,
      message: apiResponse.HORSE_UPDATED_SUCCESSFULLY,
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
        .json({ success: false, message: apiResponse.HORSE_ID_IS_REQUIRED });
    }

    const horse = await Horse.findOne({ _id: horseId, owner: customerId });
    if (!horse) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.HORSE_NOT_FOUND });
    }

    await deleteCloudinaryAsset(horse.photo, "image");
    await deleteCloudinaryAsset(horse.documents?.coggins, "raw");
    await deleteCloudinaryAsset(horse.documents?.healthCertificate, "raw");

    await horse.deleteOne();

    return res.status(200).json({
      success: true,
      message: apiResponse.HORSE_DELETED_SUCCESSFULLY,
    });
  } catch (err) {
    console.error("Delete Horse Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Unable to delete horse",
    });
  }
};
