const { apiResponse } = require("../../../responses/api.response");
const PlatformSettings = require("../../../models/admin/payment/platformSettings");

/**
 * =====================================
 *  CREATE / UPDATE PLATFORM SETTINGS
 * =====================================
 */
const updatePlatformSettings = async (req, res) => {
  try {
    let { platformFeePercent, platformFeeFlat, currency } = req.body;

    if (platformFeePercent < 0 || platformFeePercent > 100) {
      return res.status(400).json({
        message: apiResponse.PLATFORM_FEE_PERCENT_MUST_BE_BETWEEN_0_AND_100,
      });
    }

    const settings = await PlatformSettings.findOneAndUpdate(
      {},
      {
        platformFeePercent,
        platformFeeFlat,
        currency,
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      message: apiResponse.PLATFORM_SETTINGS_SAVED_SUCCESSFULLY,
      data: settings,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: apiResponse.SERVER_ERROR });
  }
};

/**
 * =====================================
 *  GET PLATFORM SETTINGS
 * =====================================
 */
const getPlatformSettings = async (req, res) => {
  try {
    let settings = await PlatformSettings.findOne();

    if (!settings) {
      settings = await PlatformSettings.create({
        platformFeePercent: 5,
        platformFeeFlat: 0,
        currency: "usd",
      });
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: apiResponse.SERVER_ERROR });
  }
};

module.exports = {
  updatePlatformSettings,
  getPlatformSettings,
};
