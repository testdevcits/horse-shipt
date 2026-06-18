const SocialMediaSettings = require("../../models/admin/socialMediaSettings.model");
const { successResponse, errorResponse } = require("../../utils/responseHandler");
const { apiResponse } = require("../../responses/api.response");

const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "twitter",
  "youtube",
  "linkedin",
];

const emptySettings = () =>
  SOCIAL_PLATFORMS.reduce((settings, platform) => {
    settings[platform] = "";
    return settings;
  }, {});

const isValidUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch (_error) {
    return false;
  }
};

const normalizePayload = (payload = {}) => {
  const normalized = {};

  for (const platform of SOCIAL_PLATFORMS) {
    if (Object.prototype.hasOwnProperty.call(payload, platform)) {
      normalized[platform] = String(payload[platform] || "").trim();
    }
  }

  return normalized;
};

const validatePayload = (payload) => {
  const errors = {};
  const seenUrls = new Map();

  for (const [platform, url] of Object.entries(payload)) {
    if (!SOCIAL_PLATFORMS.includes(platform)) {
      errors[platform] = apiResponse.INVALID_SOCIAL_MEDIA_PLATFORM;
      continue;
    }

    if (!isValidUrl(url)) {
      errors[platform] = apiResponse.INVALID_SOCIAL_MEDIA_URL;
      continue;
    }

    const key = url.toLowerCase();
    if (url && seenUrls.has(key)) {
      errors[platform] = apiResponse.DUPLICATE_SOCIAL_MEDIA_URL;
      errors[seenUrls.get(key)] = apiResponse.DUPLICATE_SOCIAL_MEDIA_URL;
    }
    if (url) seenUrls.set(key, platform);
  }

  return errors;
};

const getOrCreateSettings = async () => {
  let settings = await SocialMediaSettings.findOne();
  if (!settings) {
    settings = await SocialMediaSettings.create(emptySettings());
  }
  return settings;
};

exports.getSocialMediaSettings = async (_req, res) => {
  try {
    const settings = await SocialMediaSettings.findOne();
    return successResponse(
      res,
      200,
      apiResponse.SOCIAL_MEDIA_SETTINGS_FETCHED_SUCCESSFULLY,
      settings || emptySettings()
    );
  } catch (error) {
    console.error("Get social media settings error:", error);
    return errorResponse(res, 500, apiResponse.FAILED_TO_FETCH_SOCIAL_MEDIA_SETTINGS);
  }
};

exports.createSocialMediaSettings = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const errors = validatePayload(payload);

    if (Object.keys(errors).length) {
      return errorResponse(res, 400, apiResponse.VALIDATION_ERROR, errors);
    }

    const existing = await SocialMediaSettings.findOne();
    if (existing) {
      return errorResponse(
        res,
        409,
        apiResponse.SOCIAL_MEDIA_SETTINGS_ALREADY_EXIST
      );
    }

    const settings = await SocialMediaSettings.create({
      ...emptySettings(),
      ...payload,
    });

    return successResponse(
      res,
      201,
      apiResponse.SOCIAL_MEDIA_SETTINGS_CREATED_SUCCESSFULLY,
      settings
    );
  } catch (error) {
    console.error("Create social media settings error:", error);
    return errorResponse(res, 500, apiResponse.FAILED_TO_SAVE_SOCIAL_MEDIA_SETTINGS);
  }
};

exports.updateSocialMediaSettings = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const currentSettings = await getOrCreateSettings();
    const mergedPayload = {
      ...emptySettings(),
      ...currentSettings.toObject(),
      ...payload,
    };
    const errors = validatePayload(normalizePayload(mergedPayload));

    if (Object.keys(errors).length) {
      return errorResponse(res, 400, apiResponse.VALIDATION_ERROR, errors);
    }

    currentSettings.set(payload);
    const settings = await currentSettings.save();

    return successResponse(
      res,
      200,
      apiResponse.SOCIAL_MEDIA_SETTINGS_UPDATED_SUCCESSFULLY,
      settings
    );
  } catch (error) {
    console.error("Update social media settings error:", error);
    return errorResponse(res, 500, apiResponse.FAILED_TO_SAVE_SOCIAL_MEDIA_SETTINGS);
  }
};

exports.deleteSocialMediaSetting = async (req, res) => {
  try {
    const { platform } = req.params;

    if (!SOCIAL_PLATFORMS.includes(platform)) {
      return errorResponse(res, 400, apiResponse.INVALID_SOCIAL_MEDIA_PLATFORM);
    }

    const settings = await SocialMediaSettings.findOneAndUpdate(
      {},
      { $set: { [platform]: "" } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return successResponse(
      res,
      200,
      apiResponse.SOCIAL_MEDIA_SETTING_DELETED_SUCCESSFULLY,
      settings
    );
  } catch (error) {
    console.error("Delete social media setting error:", error);
    return errorResponse(res, 500, apiResponse.FAILED_TO_DELETE_SOCIAL_MEDIA_SETTING);
  }
};
