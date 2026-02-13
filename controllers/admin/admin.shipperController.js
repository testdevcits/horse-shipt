const Shipper = require("../../models/shipper/shipperModel");

// ================================
//  GET ALL SHIPPERS
// ================================
exports.getAllShippers = async (req, res) => {
  try {
    const shippers = await Shipper.find({})
      .select("-password") // hide password
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: shippers.length,
      data: shippers,
    });
  } catch (error) {
    console.error("Error fetching shippers:", error);
    res.status(500).json({ success: false, message: "Server Error" });
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
        .json({ success: false, message: "Shipper not found" });
    }

    res.status(200).json({ success: true, data: shipper });
  } catch (error) {
    console.error("Error fetching shipper:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

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
        .json({ success: false, message: "Shipper not found" });
    }

    res.status(200).json({
      success: true,
      message: "Shipper updated successfully",
      data: updatedShipper,
    });
  } catch (error) {
    console.error("Error updating shipper:", error);
    res.status(500).json({ success: false, message: "Server Error" });
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
        .json({ success: false, message: "Shipper not found" });
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
    console.error("Error toggling shipper status:", error);
    res.status(500).json({ success: false, message: "Server Error" });
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
        .json({ success: false, message: "Shipper not found" });
    }

    res.status(200).json({
      success: true,
      message: "Shipper deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting shipper:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
