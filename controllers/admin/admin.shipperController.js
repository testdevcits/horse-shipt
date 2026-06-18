const { apiResponse } = require("../../responses/api.response");
const Shipper = require("../../models/shipper/shipperModel");
const Driver = require("../../models/shipper/Driver");
const ShipmentQuote = require("../../models/shipper/ShipmentQuote");
const ShipperVehicle = require("../../models/shipper/ShipperVehicle");
const ShipperPreferredArea = require("../../models/shipper/shipperPreferredAreaModel");
const ShipperContract = require("../../models/shipper/shipperContractModel");
const CustomerShipment = require("../../models/customer/CustomerShipment");
const { buildPagination, sendPaginated } = require("../../utils/adminQuery");

// ================================
//  GET ALL SHIPPERS
// ================================
exports.getAllShippers = async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const { search, status } = req.query;
    const filter = {};

    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { uniqueId: { $regex: search, $options: "i" } },
      ];
    }

    const [shippers, total] = await Promise.all([
      Shipper.find(filter)
      .select("-password") // hide password
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Shipper.countDocuments(filter),
    ]);

    return sendPaginated(res, { data: shippers, total, page, limit });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ================================
//  GET SHIPPER BY ID
// ================================
exports.getShipperById = async (req, res) => {
  try {
    const { id } = req.params;

    const shipper = await Shipper.findById(id).select("-password");

    if (!shipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    const [shipments, quotes, vehicles, drivers, preferredAreas, contracts] =
      await Promise.all([
        CustomerShipment.find({ shipper: id })
          .populate("customer", "name email uniqueId phone")
          .sort({ createdAt: -1 }),
        ShipmentQuote.find({ shipper: id })
          .populate("shipment", "shipmentCode pickupLocation deliveryLocation status")
          .populate("assignedDriver", "name email phone")
          .populate("vehicle", "name make model licensePlate")
          .sort({ createdAt: -1 }),
        ShipperVehicle.find({ shipper: id }).sort({ createdAt: -1 }),
        Driver.find({ shipper: id }).select("-password").sort({ createdAt: -1 }),
        ShipperPreferredArea.find({ shipper: id }).sort({ createdAt: -1 }),
        ShipperContract.find({ shipper: id })
          .populate("customer", "name email uniqueId")
          .populate("shipment", "shipmentCode status")
          .sort({ createdAt: -1 }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        shipper,
        shipments,
        quotes,
        vehicles,
        drivers,
        preferredAreas,
        contracts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

exports.getShipperFullData = exports.getShipperById;

// ================================
//  UPDATE SHIPPER BY ID
// ================================
exports.updateShipperById = async (req, res) => {
  try {
    const { id } = req.params;

    const updateFields = { ...req.body };
    delete updateFields.password; // avoid updating password here

    const updatedShipper = await Shipper.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedShipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_UPDATED_SUCCESSFULLY,
      data: updatedShipper,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ================================
//  TOGGLE SHIPPER STATUS (Activate/Deactivate)
// ================================
exports.toggleShipperStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const shipper = await Shipper.findById(id);

    if (!shipper) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    shipper.isActive = !shipper.isActive;
    await shipper.save();

    res.status(200).json({
      success: true,
      message: `Shipper has been ${
        shipper.isActive ? "activated" : "deactivated"
      }`,
      data: shipper,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};

// ================================
//  DELETE SHIPPER BY ID
// ================================
exports.deleteShipper = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Shipper.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: apiResponse.SHIPPER_NOT_FOUND });
    }

    res.status(200).json({
      success: true,
      message: apiResponse.SHIPPER_DELETED_SUCCESSFULLY,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: apiResponse.SERVER_ERROR_2 });
  }
};
