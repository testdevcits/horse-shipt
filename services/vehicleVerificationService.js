const axios = require("axios");
const ShipperVehicle = require("../models/shipper/ShipperVehicle");

async function verifyVehicleAsync(vehicleId, vin) {
  try {
    const response = await axios.get(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`
    );

    const data = response.data?.Results?.[0];

    if (!data) return;

    await ShipperVehicle.findByIdAndUpdate(vehicleId, {
      vinMetaData: data,
      manufacturer: data.Make || "",
      model: data.Model || "",
      modelYear: data.ModelYear || null,
      bodyClass: data.BodyClass || "",
      verificationStatus: "VERIFIED",
      "verificationMeta.verifiedAt": new Date(),
      "verificationMeta.verificationSource": "NHTSA_API",
    });
  } catch (error) {
    console.log("Vehicle verification failed:", error.message);
  }
}

module.exports = { verifyVehicleAsync };
