const axios = require("axios");

exports.verifyVINData = async (vin) => {
  try {
    if (!vin) return null;

    const response = await axios.get(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesExtended/${vin}?format=json`
    );

    return response.data.Results[0];
  } catch (error) {
    console.error("VIN API Error:", error.message);
    return null;
  }
};
